// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import './ChainlinkFeedConsumer.sol';

//contract ScoreBoard {}

//keep all the predictions and pass them to score board when done
contract PredictionManager {
	enum Direction{ DOWN, UP }
	struct Prediction {
		address user;
		uint predictTimeStamp;
		uint timeHorizon; string symbol;
		Direction predictDirection;
		ChainlinkFeedConsumer.FeedResult initialPrice;
		ChainlinkFeedConsumer.FeedResult finalPrice;
		string tweetCid;
	}
	address[] users;
	Prediction[] PendingPredictions;
	uint tol = 12 hours

	function _timeWithinTolerance(uint timestamp1, uint timestamp2) private returns (bool){
		int diff = timestamp1 - timestamp2
		diff = diff >= 0 ? diff : -diff;
		return (diff > tol)
	}

	function createPrediction(address user, 
														uint tweetTimeStamp,
														string memory symbol,
														Direction predictDirection,
														string tweetCid
													 ) external {

		require(_timeWithinTolerance(block.timestamp, tweetTimeStamp), "Block timestamp and tweet timestamp is beyond tolerance");
		Prediction pred = Prediction(user, predictTimeStamp, 
	}



	function _getPrediction(address user, int currentIndex) private view returns (Prediction) {
		return userPredictions[user][currentIndex];
	}
	function _initPrediction(address user, prediction){}
	function _checkPredictionReady(){}
	function _evalPrediction(address user, predictionIndex){}
	function checkUpkeep(){} // check all pending predictions for expiry
	function performUpkeep () {} // eval 1 prediciton at a time


}

//ACTIONS -----
// Register Symbol and Oracle
// GetLatestPriceForSymbol
// Check Symbol Status (active or not)
// Deactivate Symbol and Oracle
// Update new oracle

// Add Prediction by user
// evaludate prediction (upkeep)
// get prediction
//get metadata
// get result





