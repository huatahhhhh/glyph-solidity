// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "@chainlink/contracts/src/v0.8/AutomationCompatible.sol";
import './SymbolManager.sol';
import './PriceFeedManager.sol';
import './UserManager.sol';

interface IPredictionManager {
	function createPrediction(address user,
														uint predTimestamp,
														string memory symbol,
														bool predDirection,
														uint predDuration,
														string memory ipfsCID) external;
	/*function userScore(address _address) external view returns (TrackRecord memory);*/
}

contract PredictionManager is Ownable, UserManager, AutomationCompatibleInterface, IPredictionManager{
	using SafeMath for uint;
	using SignedSafeMath for int;

	event PredictionCreated(
		address indexed user,
		uint indexed predTimestamp,
		string symbol,
		string ipfsCID,
		bool predDirection,
		uint predDuration,
		int initialPrice,
		uint initialPriceTimestamp
	);
	
	event PredictionExpired(
		address indexed user,
		uint indexed predTimestamp,
		string symbol,
		string ipfsCID
	);

	event PredictionCompleted(
		address indexed user,
		uint indexed predTimestamp,
		string symbol,
		string ipfsCID,
		bool predDirection,
		uint predDuration,
		int initialPrice,
		uint initialPriceTimestamp,
		int finalPrice,
		uint finalPriceTimestamp
	);

	event UserScoreUpdated(
		uint num_pending,
		uint num_error,
		uint num_completed,
		uint num_correct,
		int avg_return
	);

	event performedUpkeep(uint state, uint indx);

	struct PriceFeedResult {
		int price;
		uint timestamp;
	}

	struct Prediction {
		address user;
		uint predTimestamp;
		string symbol;
		bool predDirection;
		uint predDuration; 
		PriceFeedResult initialPrice;
		PriceFeedResult finalPrice;
		string ipfsCID;
	}

	struct TrackRecord {
		uint num_pending;
		uint num_error;
		uint num_completed;
		uint num_correct;
		int avg_return;
	}

	address public priceFeedManagerAddress;
	ISymbolManager private _symbolManager;
	IPriceFeedManager private _priceFeedManager;
	int public timeTolerance;
	uint public decimals = 8;
	int private _pad;

	Prediction[] public livePredictions;
	mapping(address => TrackRecord) public userTrackRecords;

	constructor (address priceFeedContract, int tolSeconds) {
		priceFeedManagerAddress = priceFeedContract;
		timeTolerance	= tolSeconds;
		_symbolManager = ISymbolManager(priceFeedManagerAddress);
		_priceFeedManager = IPriceFeedManager(priceFeedManagerAddress);

		_pad = 1;
		for (uint i=0; i < decimals; i++){
			_pad = _pad.mul(10);
		}
	}

	modifier predictActiveSymbolOnly(string memory symbol){
		require(
			_symbolManager.checkSymbolActive(symbol), 
			"Symbol is not recognized or inactive"
		);
		_;
	}

	modifier activeUserPredictOnly(address _address){
		require(
			isUser(_address),
			"Not allowed to make predictions for non-authorized users"
		);
		_;
	}

	function numLivePredictions() external view returns (uint) {
		return livePredictions.length;
	}

	function userScore(address _address) external view returns (TrackRecord memory){
		TrackRecord memory record = userTrackRecords[_address];
		return record;
	}

	function _timeWithinTolerance(uint timestamp1, uint timestamp2) private view returns (bool){
		int diff = SafeCast.toInt256(timestamp1) - SafeCast.toInt256(timestamp2);
		diff = diff >= 0 ? diff : -diff;
		return (diff < timeTolerance);
	}

	function getNumLivePredictions() public view returns (uint){
		return livePredictions.length;
	}

	function createPrediction(address user,
														uint predTimestamp,
														string memory symbol,
														bool predDirection,
														uint predDuration,
														string memory ipfsCID) 
														external 
														onlyOwner
														activeUserPredictOnly(user) 
														predictActiveSymbolOnly(symbol){

		require(_timeWithinTolerance(block.timestamp, predTimestamp),
						"Block timestamp and prediction timestamp is beyond tolerance");
		require(SafeCast.toInt256(predDuration) > timeTolerance.mul(2),
						"Prediction duration needs to be more than 2 * tolerance");

		(int initPrice, uint initPriceTimestamp) = _priceFeedManager.getSymbolLatestPrice(symbol);
		require(_timeWithinTolerance(initPriceTimestamp,predTimestamp),
						"Price feed timestamp and prediction time is beyond tolerance");

		PriceFeedResult memory initial = PriceFeedResult(initPrice, initPriceTimestamp);
		PriceFeedResult memory finalContainer = PriceFeedResult(0, 0);
	
		Prediction memory pred = Prediction(user,
																 predTimestamp,
																 symbol,
																 predDirection,
																 predDuration,
																 initial,
																 finalContainer,
																 ipfsCID);
		livePredictions.push(pred);
		userTrackRecords[user].num_pending += 1;

		emit PredictionCreated(
			user,
	  	predTimestamp,
			symbol,
			ipfsCID,
			predDirection,
			predDuration,
			initPrice,
			initPriceTimestamp
		);
	}

	function _checkPredictionExpired(Prediction memory pred) private view returns (bool expired){
		string memory symbol = pred.symbol;
		int noww = SafeCast.toInt256(block.timestamp);
		int predExpiry = SafeCast.toInt256(pred.predTimestamp + pred.predDuration);
		if (noww.sub(predExpiry) > timeTolerance){
			if(!_symbolManager.checkSymbolActive(symbol)){
				return true;
			}
			else{
				(, uint feedTimestamp) = _priceFeedManager.getSymbolLatestPrice(symbol);
				if (SafeCast.toInt256(feedTimestamp).sub(predExpiry) > timeTolerance){
					return true;
				}
			}
		}
		return false;
	}

	function _handlePredictionExpired(uint indx) private {
		Prediction memory pred = livePredictions[indx];
		if(!_checkPredictionExpired(pred)){
			return;
		}

		TrackRecord storage userRecord = userTrackRecords[pred.user];
		userRecord.num_pending = userRecord.num_pending.sub(1);
		userRecord.num_error = userRecord.num_error.add(1);

		_removeFromLivePredictions(indx);

		emit PredictionExpired(
			pred.user,
		  pred.predTimestamp,
			pred.symbol,
			pred.ipfsCID
		);
	}

	function _checkPredictionReady(Prediction memory pred) private view returns (bool){
		string memory symbol = pred.symbol;

		if(!_symbolManager.checkSymbolActive(symbol)){
			return false;
		}

		if(!isUser(pred.user)){
			return false;
		}

		uint predExpiry = pred.predTimestamp.add(pred.predDuration);
		(, uint feedTimestamp) = _priceFeedManager.getSymbolLatestPrice(symbol);

		int diff = SafeCast.toInt256(feedTimestamp).sub(SafeCast.toInt256(predExpiry));
 		return ((diff >= 0 ) && (diff < timeTolerance));	
	}
	
	function _handlePredictionReady(uint indx) private {
		Prediction storage pred = livePredictions[indx];
		if (!_checkPredictionReady(pred)) {
			return;
		}
		(int feedPrice, uint feedTimestamp) = _priceFeedManager.getSymbolLatestPrice(pred.symbol);
		pred.finalPrice.price = feedPrice;
		pred.finalPrice.timestamp = feedTimestamp;
	
		_concludePrediction(indx);
	}

	function calculateReturn(int initialPrice, int finalPrice, bool direction, int pad) private pure returns (int) {
		int ret;
		if (direction){
			ret = finalPrice.sub(initialPrice).mul(pad).div(initialPrice);
		} else {
			ret = initialPrice.sub(finalPrice).mul(pad).div(finalPrice);
		}
		return ret;
	}

	function _concludePrediction(uint indx) private {
		Prediction memory pred = livePredictions[indx];
		TrackRecord storage userRecord = userTrackRecords[pred.user];

		// check if correct
		int ret = calculateReturn(
			pred.initialPrice.price,
			pred.finalPrice.price,
			pred.predDirection,
			_pad
		);

		// update average returns
		int totalReturn = userRecord.avg_return.mul(SafeCast.toInt256(userRecord.num_completed));
		int newAvgReturn = totalReturn.add(ret).div(SafeCast.toInt256(userRecord.num_completed.add(1)));
		userRecord.avg_return = newAvgReturn;

		// if correct
		if (ret > 0){
			userRecord.num_correct = userRecord.num_correct.add(1);
		} 
		
		userRecord.num_pending = userRecord.num_pending.sub(1);
		userRecord.num_completed = userRecord.num_completed.add(1);

		_removeFromLivePredictions(indx);
		emit PredictionCompleted(
			pred.user,
			pred.predTimestamp,
			pred.symbol,
			pred.ipfsCID,
			pred.predDirection,
			pred.predDuration,
			pred.initialPrice.price,
			pred.initialPrice.timestamp,
			pred.finalPrice.price,
			pred.finalPrice.timestamp
		);
		emit UserScoreUpdated(
			userRecord.num_pending,
			userRecord.num_error,
			userRecord.num_completed,
			userRecord.num_correct,
			userRecord.avg_return
		);
	}

	function _removeFromLivePredictions(uint indx) private {
		livePredictions[indx] = livePredictions[livePredictions.length - 1];
		livePredictions.pop();
	}

  function checkUpkeep(bytes calldata)
    external
    view
    override
    returns (bool upkeepNeeded, bytes memory performData)
  {
		uint state = 0;
		uint indx;
		uint i;

		for (int j=SafeCast.toInt256(livePredictions.length)-1; j>= 0; j--){
			i = SafeCast.toUint256(j);
			Prediction memory pred = livePredictions[i];
			if (_checkPredictionReady(pred)){
				indx = i;
				state = 1;
				upkeepNeeded=true;
				break;
			}
			else if (_checkPredictionExpired(pred)) {
				indx = i;
				upkeepNeeded=true;
				break;
			}
		}

		uint[2] memory result;
		performData = abi.encode(result);

		if (upkeepNeeded){
			result[0] = state;
			result[1] = indx;
			performData = abi.encode(result);
		}

		return (upkeepNeeded, performData);
	}

	function performUpkeep(bytes calldata performData) 
		external 
		override
	{
    uint[2] memory result = abi.decode(performData, (uint[2]));
		uint state = result[0];
		uint indx = result[1];

		if (indx >= livePredictions.length)
			return;

		if (state == 0){
			_handlePredictionExpired(indx);
		}
		else if (state == 1){
			_handlePredictionReady(indx);
		}
  }
}
