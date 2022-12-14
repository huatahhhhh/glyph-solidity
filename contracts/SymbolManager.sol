// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

interface ISymbolManager {
	function checkSymbolExists(string memory symbol) external view returns (bool);
	function checkSymbolActive(string memory symbol) external view returns (bool);
	function registerSymbol(string memory symbol) external;
	function activateSymbol(string memory symbol) external;
	function deactivateSymbol(string memory symbol) external;
	function setOracle(string memory symbol, address oracle) external;
}

abstract contract SymbolManager is Ownable, ISymbolManager{
	struct symbolInformation{
		address oracle;
		bool active;
	}

	event SymbolActivatedEvent(string symbol);
	event SymbolRegisteredEvent(string symbol);
	event SymbolDeactivatedEvent(string symbol);
	event SetOracleSymbolEvent(string symbol, address indexed oracle);

	string[] public symbolArray;
	mapping(string=>symbolInformation) public symbolInfoMap;

	function checkSymbolExists(string memory symbol) public view returns (bool) {
		for (uint i=0; i<symbolArray.length; i++){
			if (keccak256(abi.encodePacked(symbol)) == keccak256(abi.encodePacked(symbolArray[i]))){
				return true;
			}
		}
		return false;
	}

	function checkSymbolActive(string memory symbol) public view returns (bool) {
		require(checkSymbolExists(symbol), "Symbol does not exist");
		return symbolInfoMap[symbol].active;
	}

	function registerSymbol(string memory symbol) external onlyOwner{
		require(!checkSymbolExists(symbol), "Symbol is already registered");
		symbolArray.push(symbol);	
		emit SymbolRegisteredEvent(symbol);
	}

	function activateSymbol(string memory symbol) external onlyOwner{
		bool modified = _setSymbolActiveState(symbol, true);
		if (modified){
			emit SymbolActivatedEvent(symbol);
		}
	}

	function deactivateSymbol(string memory symbol) external onlyOwner{
		bool modified =_setSymbolActiveState(symbol, false);
		if (modified) {
			emit SymbolDeactivatedEvent(symbol);
		}
	}

	function _setSymbolActiveState(string memory symbol, bool value) private returns (bool modified){
		require(checkSymbolExists(symbol), "Symbol does not exist");
		if (value == true) {
			require(symbolInfoMap[symbol].oracle != address(0), "Symbol cannot be activated when oracle address is not set");
		}
		bool before = symbolInfoMap[symbol].active;
		symbolInfoMap[symbol].active = value;

		modified = (before != value);
		return modified;
	}

	function setOracle(string memory symbol, address oracle) public onlyOwner{
		require(!checkSymbolActive(symbol), "Unable to change oracle address when symbol is active, deactivate first");
		require(oracle != address(0), "Oracle address cannot be null value");
		symbolInfoMap[symbol].oracle = oracle;
		emit SetOracleSymbolEvent(symbol, oracle);
	}
}
