// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SymbolManager.sol";
import "./ChainlinkFeedConsumer.sol";

interface IPriceFeedManager {
	function getSymbolLatestPrice(string memory symbol) external view returns (int price, uint timeStamp);
}

contract PriceFeedManager is ChainlinkFeedConsumer, SymbolManager, ITrackerPriceFeed{
	function getSymbolLatestPrice(string memory symbol) external view returns (int price, uint timeStamp) {
		require(checkSymbolActive(symbol), "Symbol needs to be active");
		address feedAddress = symbolInfoMap[symbol].oracle;
		return getLatestPrice(feedAddress);
	}
}

