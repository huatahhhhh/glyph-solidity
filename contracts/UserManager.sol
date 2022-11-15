// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";

interface IUserManager{
	function addUser(address _address) external;
	function isUser(address _address) external view returns (bool);
	function removeUser(address _address) external;
}

abstract contract UserManager is Ownable, IUserManager{
	address[] private userArray;
	mapping(address => bool) private userData;

	function _checkUserExists(address _address) private view returns (bool) {
		for (uint i=0; i<userArray.length; i++){
			if (_address == userArray[i]){
				return true;
			}
		}
		return false;
	}

	function addUser(address _address) external onlyOwner{
		if (!_checkUserExists(_address)){
			userArray.push(_address);
		}
		_setUserActiveStatus(_address, true);
	}

	function removeUser(address _address) external onlyOwner{
		_setUserActiveStatus(_address, false);
	}

	function _setUserActiveStatus(address _address, bool value) private {
		userData[_address] = value;
	}

	function isUser(address _address) public view returns (bool) {
		return userData[_address];
	}
}
