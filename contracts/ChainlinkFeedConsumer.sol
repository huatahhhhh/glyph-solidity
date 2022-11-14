// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";


contract ChainlinkFeedConsumer {
    function getLatestPrice(address priceFeedAddress) 
			public view returns (int price, uint timeStamp) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddress);
				(, price,, timeStamp,) = priceFeed.latestRoundData();
				return (price, timeStamp);
    }
}
