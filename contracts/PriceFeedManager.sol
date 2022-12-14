// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SymbolManager.sol";
import "./ChainlinkFeedConsumer.sol";

interface IPriceFeedManager {
	function getSymbolLatestPrice(string memory symbol) external view returns (int price, uint timeStamp);
}

contract PriceFeedManager is ChainlinkFeedConsumer, SymbolManager, IPriceFeedManager{
	function getSymbolLatestPrice(string memory symbol) virtual external view returns (int price, uint timeStamp) {
		require(checkSymbolActive(symbol), "Symbol needs to be active");
		address feedAddress = symbolInfoMap[symbol].oracle;
		return getLatestPrice(feedAddress);
	}
}

contract TestPriceFeedManager is PriceFeedManager{
	uint public mockTimeStamp;
	int public mockPrice;

	function setTimeStamp(uint ts) public{
		mockTimeStamp = ts;
	}

	function setPrice(int price) public{
		mockPrice = price;
	}

	function updateTimeStamp() public{
		mockTimeStamp = block.timestamp;
	}

	function getSymbolLatestPrice(string memory symbol) override external view returns (int price, uint) {
		require(checkSymbolActive(symbol), "Symbol needs to be active");
		return (mockPrice, mockTimeStamp);
	}
}


