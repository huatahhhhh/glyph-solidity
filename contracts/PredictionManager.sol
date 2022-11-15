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
														uint predTimeStamp,
														string memory symbol,
														bool predDirection,
														uint predDuration,
														string memory ifpsCID) 
														external;
	// chainlink automation
	/*function checkUpkeep(bytes calldata checkData) external returns (bool upkeedNeeded, bytes memory performData);*/
	/*function checkPrediction(uint predIndex);*/
	/*function performUpkeep(bytes calldata performData) external;*/
	/*function evaluatePrediction(uint predIndex);*/
}

contract PredictionManager is Ownable, UserManager, AutomationCompatibleInterface{
	using SafeMath for uint;
	using SignedSafeMath for int;

	struct PriceFeedResult {
		int price;
		uint timeStamp;
	}

	struct Prediction {
		address user;
		uint predTimeStamp;
		string symbol;
		bool predDirection;
		uint predDuration; 
		PriceFeedResult initialPrice;
		PriceFeedResult finalPrice;
		string ipfsCID;
	}

	struct TrackRecord {
		uint num_pred_pending;
		uint num_pred_error;
		uint num_pred_completed;
		uint num_correct;
		int avg_return;
	}

	address public priceFeedManagerAddress;
	ISymbolManager private _symbolManager;
	IPriceFeedManager private _priceFeedManager;
	int public timeTolerance;
	int public decimals = 8;

	Prediction[] public livePredictions;
	mapping(address => TrackRecord) public userTrackRecords;

	constructor (address priceFeedContract, int tolSeconds) {
		priceFeedManagerAddress = priceFeedContract;
		timeTolerance	= tolSeconds;
		_symbolManager = ISymbolManager(priceFeedManagerAddress);
		_priceFeedManager = IPriceFeedManager(priceFeedManagerAddress);
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

	function _timeWithinTolerance(uint timestamp1, uint timestamp2) private view returns (bool){
		int diff = SafeCast.toInt256(timestamp1) - SafeCast.toInt256(timestamp2);
		diff = diff >= 0 ? diff : -diff;
		return (diff < timeTolerance);
	}

	function getNumLivePredictions() public view returns (uint){
		return livePredictions.length;
	}

	function createPrediction(address user,
														uint predTimeStamp,
														string memory symbol,
														bool predDirection,
														uint predDuration,
														string memory ipfsCID) 
														external 
														onlyOwner
														activeUserPredictOnly(user) 
														predictActiveSymbolOnly(symbol){

		require(_timeWithinTolerance(block.timestamp, predTimeStamp),
						"Block timestamp and prediction timestamp is beyond tolerance");
		require(SafeCast.toInt256(predDuration) > timeTolerance.mul(2),
						"Prediction duration needs to be more than 2 * tolerance");

		(int initPrice, uint initPriceTimestamp) = _priceFeedManager.getSymbolLatestPrice(symbol);
		require(_timeWithinTolerance(initPriceTimestamp,predTimeStamp),
						"Price feed timestamp and prediction time is beyond tolerance");

		PriceFeedResult memory initial = PriceFeedResult(initPrice, initPriceTimestamp);
		PriceFeedResult memory finalContainer = PriceFeedResult(0, 0);
	
		Prediction memory pred = Prediction(user,
																 predTimeStamp,
																 symbol,
																 predDirection,
																 predDuration,
																 initial,
																 finalContainer,
																 ipfsCID);
		livePredictions.push(pred);
		userTrackRecords[user].num_pred_pending += 1;
	}

	function _checkPredictionExpired(Prediction memory pred) private view returns (bool expired){
		string memory symbol = pred.symbol;
		int noww = SafeCast.toInt256(block.timestamp);
		if(!_symbolManager.checkSymbolActive(symbol)){
			int predExpiry = SafeCast.toInt256(pred.predTimeStamp + pred.predDuration);
			if (noww - predExpiry > timeTolerance.mul(5)){
				return true;
			}
		} else {
			(, uint feedTimestamp) = _priceFeedManager.getSymbolLatestPrice(symbol);
			if (noww - SafeCast.toInt256(feedTimestamp) > timeTolerance.mul(5)){
				return true;
			}
		}
		return false;
	}

	function _handlePredictionExpired(uint indx) private {
		Prediction memory pred = livePredictions[indx];
		if(!_checkPredictionExpired(pred)){
			return;
		}
		TrackRecord memory userRecord = userTrackRecords[pred.user];
		userRecord.num_pred_pending = userRecord.num_pred_pending.sub(1);
		userRecord.num_pred_error = userRecord.num_pred_error.add(1);

		_removeFromLivePredictions(indx);
	}

	function _checkPredictionReady(Prediction memory pred) private view returns (bool ready){
		string memory symbol = pred.symbol;

		if(!_symbolManager.checkSymbolActive(symbol)){
			return false;
		}
		uint predExpiry = pred.predTimeStamp.add(pred.predDuration);
		(, uint feedTimestamp) = _priceFeedManager.getSymbolLatestPrice(symbol);
 		return (
			_timeWithinTolerance(
				predExpiry.add(SafeCast.toUint256(timeTolerance)), 
				feedTimestamp)
		);
	}
	
	function _handlePredictionReady(uint indx) private {
		Prediction memory pred = livePredictions[indx];
		if (!_checkPredictionReady(pred)) {
			return;
		}
		(int price, uint feedTimestamp) = _priceFeedManager.getSymbolLatestPrice(pred.symbol);
		PriceFeedResult memory finalPrice = PriceFeedResult(price, feedTimestamp);
		pred.finalPrice = finalPrice;
		_concludePrediction(indx);
	}

	function calculateReturn(int initialPrice, int finalPrice, bool direction, int num_decimals) private pure returns (int) {
		int ret = finalPrice.sub(initialPrice).mul(num_decimals).div(initialPrice);

		//short
		if (!direction){
			ret = ret.mul(-1);
		}
		return ret;
	}

	function _concludePrediction(uint indx) private {
		Prediction memory pred = livePredictions[indx];
		TrackRecord memory userRecord = userTrackRecords[pred.user];

		// check if correct
		int ret = calculateReturn(
			pred.initialPrice.price,
			pred.finalPrice.price,
			pred.predDirection,
			decimals
		);

		// update average returns
		int totalReturn = userRecord.avg_return.mul(SafeCast.toInt256(userRecord.num_pred_completed));
		int newAvgReturn = totalReturn.add(ret).div(SafeCast.toInt256(userRecord.num_pred_completed.add(1)));
		userRecord.avg_return = newAvgReturn;

		// if correct
		if (ret > 0){
			userRecord.num_correct = userRecord.num_correct.add(1);
		} 
		
		userRecord.num_pred_pending = userRecord.num_pred_pending.sub(1);
		userRecord.num_pred_completed = userRecord.num_pred_pending.add(1);

		_removeFromLivePredictions(indx);
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

		for (uint i=livePredictions.length-1; i >= 0; i--){
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
		if (upkeepNeeded){
			uint[2] memory result;
			result[0] = state;
			result[1] = indx;
			performData = abi.encode(result);
		}
    return (upkeepNeeded, performData);
  }

	function performUpkeep(bytes calldata performData) 
		external {
    uint[] memory result = abi.decode(performData, (uint[]));
		uint state = result[0];
		uint indx = result[1];

		if (state == 0){
			_handlePredictionExpired(indx);
		}
		else if (state == 1){
			_handlePredictionReady(indx);
		}
  }
}
	/*function checkUpkeep(){} // check all pending predictions for expiry*/
	/*function performUpkeep () {} // eval 1 prediciton at a time*/
