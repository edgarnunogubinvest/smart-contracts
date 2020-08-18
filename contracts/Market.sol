pragma solidity 0.5.7;

import "./external/oraclize/ethereum-api/provableAPI.sol";
import "./config/MarketConfig.sol";
import "./interfaces/IToken.sol";
import "./interfaces/ITokenController.sol";
import "./interfaces/IPlotus.sol";

contract Market is usingProvable {
    using SafeMath for uint;

    enum PredictionStatus {
      Started,
      Closed,
      ResultDeclared
    }
  
    uint constant totalOptions = 3;
    uint internal startTime;
    uint internal expireTime;
    bytes32 internal marketCurrency;
    address internal marketCurrencyAddress;
    uint public rate;
    uint public WinningOption;
    bool public lockedForDispute;
    bytes32 internal marketResultId;
    uint[] public rewardToDistribute;
    PredictionStatus internal predictionStatus;
    uint internal settleTime;
    uint internal marketCoolDownTime;
    uint totalStaked;
    uint predictionTime;

    bool commissionExchanged;

    address[] predictionAssets;
    address[] incentiveTokens;
    
    mapping(address => mapping(address => mapping(uint => uint))) public assetStaked;
    mapping(address => mapping(address => mapping(uint => uint))) internal LeverageAsset;
    mapping(address => mapping(uint => uint)) public userPredictionPoints;
    mapping(address => uint256) internal commissionAmount;
    mapping(address => uint256) internal stakedTokenApplied;
    mapping(address => bool) internal userClaimedReward;

    IPlotus internal pl;
    ITokenController internal tokenController;
    MarketConfig internal marketConfig;
    address internal token;
    
    struct option
    {
      uint minValue;
      uint maxValue;
      uint predictionPoints;
      uint assetStakedValue;
      mapping(address => uint256) assetStaked;
      mapping(address => uint256) assetLeveraged;
      address[] stakers;
    }

    mapping(address => uint256) incentiveToDistribute;
    mapping(uint=>option) public optionsAvailable;

    /**
    * @dev Initialize the market.
    * @param _startTime The time at which market will create.
    * @param _predictionTime The time duration of market.
    * @param _settleTime The time at which result of market will declared.
    * @param _minValue The minimum value of middle option range.
    * @param _maxValue The maximum value of middle option range.
    * @param _marketCurrency The stock name of market.
    * @param _marketCurrencyAddress The address to gets the price calculation params.
    */
    function initiate(uint _startTime, uint _predictionTime, uint _settleTime, uint _minValue, uint _maxValue, bytes32 _marketCurrency,address _marketCurrencyAddress) public payable {
      pl = IPlotus(msg.sender);
      marketConfig = MarketConfig(pl.marketConfig());
      tokenController = ITokenController(pl.tokenController());
      token = tokenController.token();
      startTime = _startTime;
      marketCurrency = _marketCurrency;
      marketCurrencyAddress = _marketCurrencyAddress;
      settleTime = _settleTime;
      // optionsAvailable[0] = option(0,0,0,0,0,address(0));
      uint _coolDownTime;
      uint _rate;
      (predictionAssets, incentiveTokens, _coolDownTime, _rate) = marketConfig.getMarketInitialParams();
      rate = _rate;
      predictionTime = _predictionTime; 
      expireTime = startTime + _predictionTime;
      marketCoolDownTime = expireTime + _coolDownTime;
      require(expireTime > now);
      setOptionRanges(_minValue,_maxValue);
      marketResultId = provable_query(startTime.add(settleTime), "URL", "json(https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT).price", 400000);
      // chainLinkOracle = IChainLinkOracle(marketConfig.getChainLinkPriceOracle());
      // incentiveTokens = _incentiveTokens;
      // uniswapFactoryAddress = _uniswapFactoryAdd;
      // factory = Factory(_uniswapFactoryAdd);
    }

    /**
    * @dev Gets the status of market.
    * @return PredictionStatus representing the status of market.
    */
    function marketStatus() internal view returns(PredictionStatus){
      if(predictionStatus == PredictionStatus.Started && now >= expireTime) {
        return PredictionStatus.Closed;
      }
      return predictionStatus;
    }

    /**
    * @dev Gets the asset value in ether.
    * @param _exchange The exchange address of token.
    * @param _amount The amount of token.
    * @return uint256 representing the token value in ether.
    */
    function _getAssetValue(address _exchange, uint256 _amount) internal view returns(uint256) {
      return Exchange(_exchange).getTokenToEthInputPrice(_amount);
    }
  
    /**
    * @dev Calculates the price of available option ranges.
    * @param _option The number of option ranges.
    * @param _totalStaked The total staked amount on options.
    * @param _assetStakedOnOption The asset staked on options.
    * @return _optionPrice uint representing the price of option range.
    */
    function _calculateOptionPrice(uint _option, uint _totalStaked, uint _assetStakedOnOption) internal view returns(uint _optionPrice) {
      _optionPrice = 0;
      uint currentPriceOption = 0;
      uint minTimeElapsed = predictionTime.div(predictionTime);
      ( ,uint stakeWeightage,uint stakeWeightageMinAmount,uint predictionWeightage, uint currentPrice) = marketConfig.getPriceCalculationParams(marketCurrencyAddress);
      if(now > expireTime) {
        return 0;
      }
      if(_totalStaked > stakeWeightageMinAmount) {
        _optionPrice = (_assetStakedOnOption).mul(1000000).div(_totalStaked.mul(stakeWeightage));
      }

      uint maxDistance;
      if(currentPrice < optionsAvailable[2].minValue) {
        currentPriceOption = 1;
        maxDistance = 2;
      } else if(currentPrice > optionsAvailable[2].maxValue) {
        currentPriceOption = 3;
        maxDistance = 2;
      } else {
        currentPriceOption = 2;
        maxDistance = 1;
      }
      uint distance = currentPriceOption > _option ? currentPriceOption.sub(_option) : _option.sub(currentPriceOption);
      uint timeElapsed = now > startTime ? now.sub(startTime) : 0;
      timeElapsed = timeElapsed > minTimeElapsed ? timeElapsed: minTimeElapsed;
      _optionPrice = _optionPrice.add((((maxDistance+1).sub(distance)).mul(1000000).mul(timeElapsed)).div((maxDistance+1).mul(predictionWeightage).mul(predictionTime)));
      _optionPrice = _optionPrice.div(100);
    }

   /**
    * @dev Calculate the option price of market.
    * @param _midRangeMin The minimum value of middle option range.
    * @param _midRangeMax The maximum value of middle option range.
    */
    function setOptionRanges(uint _midRangeMin, uint _midRangeMax) internal{
      optionsAvailable[1].minValue = 0;
      optionsAvailable[1].maxValue = _midRangeMin.sub(1);
      optionsAvailable[2].minValue = _midRangeMin;
      optionsAvailable[2].maxValue = _midRangeMax;
      optionsAvailable[3].minValue = _midRangeMax.add(1);
      optionsAvailable[3].maxValue = ~uint256(0) ;
    }

   /**
    * @dev Calculates the prediction value.
    * @param _prediction The option range on which user place prediction.
    * @param _stake The amount staked by user.
    * @param _priceStep The option price will update according to priceStep.
    * @param _leverage The leverage opted by user at the time of prediction.
    * @return uint256 representing the prediction value.
    */
    function _calculatePredictionValue(uint _prediction, uint _stake, uint _priceStep, uint _leverage) internal view returns(uint _predictionValue) {
      uint value;
      uint flag = 0;
      uint _totalStaked = totalStaked;
      uint _assetStakedOnOption = optionsAvailable[_prediction].assetStakedValue;
      _predictionValue = 0;
      while(_stake > 0) {
        if(_stake <= (_priceStep)) {
          value = (uint(_stake)).div(rate);
          _predictionValue = _predictionValue.add(value.mul(_leverage).div(_calculateOptionPrice(_prediction, _totalStaked, _assetStakedOnOption + flag.mul(_priceStep))));
          break;
        } else {
          _stake = _stake.sub(_priceStep);
          value = (uint(_priceStep)).div(rate);
          _predictionValue = _predictionValue.add(value.mul(_leverage).div(_calculateOptionPrice(_prediction, _totalStaked, _assetStakedOnOption + flag.mul(_priceStep))));
          _totalStaked = _totalStaked.add(_priceStep);
          flag++;
        }
      }
    }

   /**
    * @dev Estimates the prediction value.
    * @param _prediction The option range on which user place prediction.
    * @param _stake The amount staked by user.
    * @param _leverage The leverage opted by user at the time of prediction.
    * @return uint256 representing the prediction value.
    */
    function estimatePredictionValue(uint _prediction, uint _stake, uint _leverage) public view returns(uint _predictionValue){
      ( , , , uint priceStep, uint256 positionDecimals) = marketConfig.getBasicMarketDetails();
      return _calculatePredictionValue(_prediction, _stake.mul(positionDecimals), priceStep, _leverage);
    }

    /**
    * @dev Gets the price of specific option.
    * @param _prediction The option number to query the balance of.
    * @return uint representing the price owned by the passed prediction.
    */
    function getOptionPrice(uint _prediction) public view returns(uint) {
      // (, , , , , , ) = marketConfig.getBasicMarketDetails();
     return _calculateOptionPrice(_prediction, totalStaked, optionsAvailable[_prediction].assetStakedValue);
    }

    /**
    * @dev Gets the market data.
    * @return _marketCurrency bytes32 representing the currency or stock name of the market.
    * @return minvalue uint[] memory representing the minimum range of all the options of the market.
    * @return maxvalue uint[] memory representing the maximum range of all the options of the market.
    * @return _optionPrice uint[] memory representing the option price of each option ranges of the market.
    * @return _assetStaked uint[] memory representing the assets staked on each option ranges of the market.
    * @return _predictionType uint representing the type of market.
    * @return _expireTime uint representing the expire time of the market.
    * @return _predictionStatus uint representing the status of the market.
    */
    function getData() public view returns
       (bytes32 _marketCurrency,uint[] memory minvalue,uint[] memory maxvalue,
        uint[] memory _optionPrice, uint[] memory _assetStaked,uint _predictionType,uint _expireTime, uint _predictionStatus){
        _marketCurrency = marketCurrency;
        _expireTime =expireTime;
        _predictionStatus = uint(marketStatus());
        minvalue = new uint[](totalOptions);
        maxvalue = new uint[](totalOptions);
        _optionPrice = new uint[](totalOptions);
        _assetStaked = new uint[](totalOptions);
        for (uint i = 0; i < totalOptions; i++) {
        _assetStaked[i] = optionsAvailable[i+1].assetStakedValue;
        minvalue[i] = optionsAvailable[i+1].minValue;
        maxvalue[i] = optionsAvailable[i+1].maxValue;
        _optionPrice[i] = _calculateOptionPrice(i+1, totalStaked, optionsAvailable[i+1].assetStakedValue);
       }
    }

   /**
    * @dev Gets the result of the market.
    * @return uint256 representing the winning option of the market.
    * @return uint256 representing the positions of the winning option range.
    * @return uint[] memory representing the reward to be distribute of the market.
    * @return address[] memory representing the users who place prediction on winnning option.
    * @return uint256 representing the assets staked on winning option.
    */
    function getMarketResults() public view returns(uint256, uint256, uint256[] memory, address[] memory, uint256) {
      return (WinningOption, optionsAvailable[WinningOption].predictionPoints, rewardToDistribute, optionsAvailable[WinningOption].stakers, optionsAvailable[WinningOption].assetStakedValue);
    }

    /**
    * @dev Place prediction on the available option ranges of the market.
    * @param _asset The assets uses by user during prediction whether it is token address or in ether.
    * @param _predictionStake The amount staked by user at the time of prediction.
    * @param _prediction The option range on which user place prediction.
    * @param _leverage The leverage opted by user at the time of prediction.
    */
    function placePrediction(address _asset, uint256 _predictionStake, uint256 _prediction,uint256 _leverage) public payable {
      // require(_prediction <= 3 && _leverage <= 5);
      require(now >= startTime && now <= expireTime);
      if(_asset == tokenController.bLOTToken()) {
        require(_leverage == 5);
        tokenController.swapBLOT(_predictionStake);
        _asset = token;
      } else {
        require(_isAllowedToStake(_asset));
      }
      (uint256 _commision, address _exchange) = marketConfig.getAssetData(_asset);
      _predictionStake = _collectInterestReturnStake(_commision, _predictionStake, _asset);
      uint256 _stakeValue = _predictionStake;
      if(_asset == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
        require(_predictionStake == msg.value);
      } else {
        require(msg.value == 0);
        require(IToken(_asset).transferFrom(msg.sender, address(this), _predictionStake));
        _stakeValue =_getAssetValue(_exchange, _predictionStake);
      }
      (uint minPrediction, , , uint priceStep, uint256 positionDecimals) = marketConfig.getBasicMarketDetails();
      require(_stakeValue >= minPrediction,"Min prediction amount required");

      uint predictionPoints = _calculatePredictionValue(_prediction, _stakeValue.mul(positionDecimals), priceStep, _leverage);
      predictionPoints = _checkMultiplier(_asset, _predictionStake, predictionPoints, _stakeValue);

      _storePredictionData(_prediction, _predictionStake, _stakeValue, _asset, _leverage, predictionPoints);
      // pl.callPlacePredictionEvent(msg.sender,_predictionStake, predictionPoints, _asset, _prediction, _leverage);
    }

    function _isAllowedToStake(address _asset) internal view returns(bool) {
      for(uint256 i = 0; i < predictionAssets.length; i++) {
        if(predictionAssets[i] == _asset) {
          return true;
        }
      }
    }

    /**
    * @dev Gets the interest return of the stake after commission.
    * @param _commision The commission percentage.
    * @param _predictionStake The amount staked by user at the time of prediction.
    * @param _asset The assets uses by user during prediction.
    * @return uint256 representing the interest return of the stake.
    */
    function _collectInterestReturnStake(uint256 _commision, uint256 _predictionStake, address _asset) internal returns(uint256) {
      _commision = _predictionStake.mul(_commision).div(100);
      _predictionStake = _predictionStake.sub(_commision);
      commissionAmount[_asset] = commissionAmount[_asset].add(_commision);
      return _predictionStake;
    }

    /**
    * @dev Stores the prediction data.
    * @param _prediction The option range on which user place prediction.
    * @param _predictionStake The amount staked by user at the time of prediction.
    * @param _stakeValue The stake value of asset.
    * @param _asset The assets uses by user during prediction.
    * @param _leverage The leverage opted by user during prediction.
    * @param predictionPoints The positions user gets during prediction.
    */
    function _storePredictionData(uint _prediction, uint _predictionStake, uint _stakeValue, address _asset, uint _leverage, uint predictionPoints) internal {
      if(userPredictionPoints[msg.sender][_prediction] == 0) {
        optionsAvailable[_prediction].stakers.push(msg.sender);
      }

      totalStaked = totalStaked.add(_stakeValue);
      userPredictionPoints[msg.sender][_prediction] = userPredictionPoints[msg.sender][_prediction].add(predictionPoints);
      assetStaked[msg.sender][_asset][_prediction] = assetStaked[msg.sender][_asset][_prediction].add(_predictionStake);
      LeverageAsset[msg.sender][_asset][_prediction] = LeverageAsset[msg.sender][_asset][_prediction].add(_predictionStake.mul(_leverage));
      optionsAvailable[_prediction].predictionPoints = optionsAvailable[_prediction].predictionPoints.add(predictionPoints);
      optionsAvailable[_prediction].assetStakedValue = optionsAvailable[_prediction].assetStakedValue.add(_stakeValue);
      optionsAvailable[_prediction].assetStaked[_asset] = optionsAvailable[_prediction].assetStaked[_asset].add(_stakeValue);
      optionsAvailable[_prediction].assetLeveraged[_asset] = optionsAvailable[_prediction].assetLeveraged[_asset].add(_predictionStake.mul(_leverage));
    }

    /**
    * @dev Check multiplier if user maitained the configurable amount of tokens.
    * @param _asset The assets uses by user during prediction.
    * @param _predictionStake The amount staked by user at the time of prediction.
    * @param predictionPoints The positions user gets during prediction.
    * @param _stakeValue The stake value of asset.
    * @return uint256 representing the interest return of the stake.
    */
    function _checkMultiplier(address _asset, uint _predictionStake, uint predictionPoints, uint _stakeValue) internal returns(uint) {
      uint _stakeRatio;
      uint _minMultiplierRatio;
      uint _minStakeForMultiplier;
      uint _predictionTime = expireTime.sub(startTime);
      (_stakeRatio, _minMultiplierRatio, _minStakeForMultiplier) = marketConfig.getMultiplierParameters(_asset);
      if(_stakeValue < _minStakeForMultiplier) {
        return predictionPoints;
      }
      uint _stakedBalance = tokenController.tokensLockedAtTime(msg.sender, "SM", (_predictionTime.mul(2)).add(now));
      // _stakedBalance = _stakedBalance.sub(stakedTokenApplied[msg.sender])
      uint _stakedTokenRatio = _stakedBalance.div(_predictionStake.mul(_stakeRatio));
      if(_stakedTokenRatio > _minMultiplierRatio) {
        _stakedTokenRatio = _stakedTokenRatio.mul(10);
        predictionPoints = predictionPoints.mul(_stakedTokenRatio).div(100);
      }
      // if(_multiplier > 0) {
        // stakedTokenApplied[msg.sender] = stakedTokenApplied[msg.sender].add(_predictionStake.mul(_stakeRatio));
      // }
      return predictionPoints;
    }

    /**
    * @dev Exchanges the commission after closing the market.
    */
    function exchangeCommission() external {
      uint256 _uniswapDeadline;
      uint256 _lotPurchasePerc;
      (_lotPurchasePerc, _uniswapDeadline) = marketConfig.getPurchasePercAndDeadline();
      for(uint256 i = 0; i < predictionAssets.length; i++ ) {
        if(commissionAmount[predictionAssets[i]] > 0) {
          if(predictionAssets[i] == token){
            tokenController.burnCommissionTokens(commissionAmount[predictionAssets[i]]);
          } else {
            address _exchange;
            ( , _exchange) = marketConfig.getAssetData(token);
            Exchange exchange = Exchange(_exchange);
            uint256 _lotPurchaseAmount = (commissionAmount[predictionAssets[i]]).sub((commissionAmount[predictionAssets[i]]).mul(_lotPurchasePerc).div(100));
            uint256 _amountToPool = (commissionAmount[predictionAssets[i]]).sub(_lotPurchasePerc);
            _transferAsset(predictionAssets[i], address(pl), _amountToPool);
            uint256 _tokenOutput;
            if(predictionAssets[i] == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
              _tokenOutput = exchange.ethToTokenSwapInput.value(_lotPurchaseAmount)(1, _uniswapDeadline);
            } else {
              _tokenOutput = exchange.tokenToTokenSwapInput(_lotPurchaseAmount, 1, 1, _uniswapDeadline, predictionAssets[i]);
            }
            incentiveToDistribute[token] = incentiveToDistribute[token].add(_tokenOutput);
          }
        }
      }
      commissionExchanged = true;
    }

    /**
    * @dev Calculate the result of market.
    * @param _value The current price of market currency.
    */
    function calculatePredictionResult(uint _value) public {
      //Owner can set the result, for testing. To be removed when deployed on mainnet
      require(msg.sender == pl.owner() || msg.sender == provable_cbAddress());
      _postResult(_value);
      //Get donation, commission addresses and percentage
      // (, , address payable commissionAccount, uint commission) = marketConfig.getFundDistributionParams();
       // commission = commission.mul(totalReward).div(100);
       // donation = donation.mul(totalReward).div(100);
       // rewardToDistribute = totalReward.sub(commission);
       // _transferAsset(predictionAssets[0], commissionAccount, commission);
       // _transferAsset(predictionAsset, donationAccount, donation);
      // if(optionsAvailable[WinningOption].assetStaked == 0){
      // }

    }

    /**
    * @dev Calculate the result of market here.
    * @param _value The current price of market currency.
    */
    function _postResult(uint256 _value) internal {
      require(now >= settleTime,"Time not reached");
      require(_value > 0,"value should be greater than 0");
      ( , ,uint lossPercentage, , ) = marketConfig.getBasicMarketDetails();
      // uint distanceFromWinningOption = 0;
      predictionStatus = PredictionStatus.ResultDeclared;
      if(_value < optionsAvailable[2].minValue) {
        WinningOption = 1;
      } else if(_value > optionsAvailable[2].maxValue) {
        WinningOption = 3;
      } else {
        WinningOption = 2;
      }
      uint[] memory totalReward = new uint256[](predictionAssets.length);
      uint[] memory _commission = new uint[](predictionAssets.length);
      if(optionsAvailable[WinningOption].assetStakedValue > 0){
        for(uint j = 0; j < predictionAssets.length; j++) {
          _commission[j] = commissionAmount[predictionAssets[j]];
          for(uint i=1;i <= totalOptions;i++){
         // distanceFromWinningOption = i>WinningOption ? i.sub(WinningOption) : WinningOption.sub(i);
            if(i!=WinningOption) {
            totalReward[j] = totalReward[j].add((lossPercentage.mul(optionsAvailable[i].assetLeveraged[predictionAssets[j]])).div(100));
            }
          }
        }
        rewardToDistribute = totalReward;
      } else {
        for(uint i = 0; i< predictionAssets.length; i++) {
          for(uint j=1;j <= totalOptions;j++){
            _transferAsset(predictionAssets[i], address(pl), optionsAvailable[j].assetStaked[predictionAssets[i]]);
          }
        }
      }
      pl.callMarketResultEvent(predictionAssets, rewardToDistribute, _commission, WinningOption);
    }

    /**
    * @dev Raises the dispute by user if wrong value passed at the time of market result declaration.
    * @param proposedValue The proposed value of market currency.
    * @param proposalTitle The title of proposal created by user.
    * @param shortDesc The short description of dispute.
    * @param description The description of dispute.
    * @param solutionHash The ipfs solution hash.
    */
    function raiseDispute(uint256 proposedValue, string memory proposalTitle, string memory shortDesc, string memory description, string memory solutionHash) public {
      require(predictionStatus == PredictionStatus.ResultDeclared);
      uint _stakeForDispute =  marketConfig.getDisputeResolutionParams();
      require(IToken(token).transferFrom(msg.sender, address(pl), _stakeForDispute));
      lockedForDispute = true;
      pl.createGovernanceProposal(proposalTitle, description, solutionHash, abi.encode(address(this), proposedValue), _stakeForDispute, msg.sender);
    }

    /**
    * @dev Resolve the dispute if wrong value passed at the time of market result declaration.
    * @param finalResult The final correct value of market currency.
    */
    function resolveDispute(uint256 finalResult) external {
      require(msg.sender == address(pl));
      _postResult(finalResult);
      lockedForDispute = false;
    }

    /**
    * @dev Transfer the assets to specified address.
    * @param _asset The asset transfer to the specific address.
    * @param _recipient The address to transfer the asset of
    * @param _amount The amount which is transfer.
    */
    function _transferAsset(address _asset, address payable _recipient, uint256 _amount) internal {
      if(_asset == address(0)) {
        _recipient.transfer(_amount);
      } else {
        require(IToken(_asset).transfer(_recipient, _amount));
      }
    }

    /**
    * @dev Gets the return amount of the specified address.
    * @param _user The address to specify the return of
    * @return returnAmount uint[] memory representing the return amount.
    * @return _predictionAssets address[] memory representing the address of asset.
    * @return incentive uint[] memory representing the incentive.
    * @return _incentiveTokens address[] memory representing the incentive token.
    */
    function getReturn(address _user)public view returns (uint[] memory returnAmount, address[] memory _predictionAssets, uint[] memory incentive, address[] memory _incentiveTokens){
      if(predictionStatus != PredictionStatus.ResultDeclared || totalStaked ==0) {
       return (returnAmount, _predictionAssets, incentive, _incentiveTokens);
      }
      // uint[] memory _return;
      uint256 _totalUserPredictionPoints = 0;
      uint256 _totalPredictionPoints = 0;
      (returnAmount, _totalUserPredictionPoints, _totalPredictionPoints) = _calculateUserReturn(_user);
      incentive = _calculateIncentives(_totalUserPredictionPoints, _totalPredictionPoints);
      // returnAmount =  _return;
      if(userPredictionPoints[_user][WinningOption] > 0) {
        returnAmount = _addUserReward(_user, returnAmount);
      }
      return (returnAmount, predictionAssets, incentive, incentiveTokens);
    }

    /**
    * @dev Adds the reward in the total return of the specified address.
    * @param _user The address to specify the return of.
    * @param returnAmount The return amount.
    * @return uint[] memory representing the return amount after adding reward.
    */
    function _addUserReward(address _user, uint[] memory returnAmount) internal view returns(uint[] memory){
      uint reward;
      for(uint j = 0; j< predictionAssets.length; j++) {
        reward = userPredictionPoints[_user][WinningOption].mul(rewardToDistribute[j]).div(optionsAvailable[WinningOption].predictionPoints);
        returnAmount[j] = returnAmount[j].add(reward);
      }
      return returnAmount;
    }

    /**
    * @dev Calculate the return of the specified address.
    * @param _user The address to query the return of.
    * @return _return uint[] memory representing the return amount owned by the passed address.
    * @return _totalUserPredictionPoints uint representing the positions owned by the passed address.
    * @return _totalPredictionPoints uint representing the total positions of winners.
    */
    function _calculateUserReturn(address _user) internal view returns(uint[] memory _return, uint _totalUserPredictionPoints, uint _totalPredictionPoints){
      ( , ,uint lossPercentage, , ) = marketConfig.getBasicMarketDetails();
      _return = new uint256[](predictionAssets.length);
      for(uint  i=1;i<=totalOptions;i++){
        _totalUserPredictionPoints = _totalUserPredictionPoints.add(userPredictionPoints[_user][i]);
        _totalPredictionPoints = _totalPredictionPoints.add(optionsAvailable[i].predictionPoints);
        if(i != WinningOption) {
          for(uint j = 0; j< predictionAssets.length; j++) {
            _return[j] =  _callReturn(_return[j], _user, i, lossPercentage, predictionAssets[j]);
          }
        }
      }
    }

    /**
    * @dev Calculates the incentives.
    * @param _totalUserPredictionPoints The positions of user.
    * @param _totalPredictionPoints The total positions of winners.
    * @return incentive uint[] memory representing the calculated incentive.
    */
    function _calculateIncentives(uint256 _totalUserPredictionPoints, uint256 _totalPredictionPoints) internal view returns(uint256[] memory incentive){
      incentive = new uint256[](incentiveTokens.length);
      for(uint i = 0; i < incentiveTokens.length; i++) {
        incentive[i] = _totalUserPredictionPoints.mul(incentiveToDistribute[incentiveTokens[i]]).div(_totalPredictionPoints);
      }
    }

    /**
    * @dev Gets the pending return.
    * @param _user The address to specify the return of.
    * @return uint representing the pending return amount.
    */
    function getPendingReturn(address _user) external view returns(uint, uint){
      if(userClaimedReward[_user]) return (0,0);
      // return getReturn(_user);
    }
    
    /**
    * @dev Calls the total return amount internally.
    */
    function _callReturn(uint _return,address _user,uint i,uint lossPercentage, address _asset)internal view returns(uint){
      return _return.add(assetStaked[_user][_asset][i].sub((LeverageAsset[_user][_asset][i].mul(lossPercentage)).div(100)));
    }

    /**
    * @dev Claim the return amount of the specified address.
    * @param _user The address to query the claim return amount of.
    */
    function claimReturn(address payable _user) public {
      require(commissionExchanged && !lockedForDispute && now > marketCoolDownTime);
      require(!userClaimedReward[_user],"Already claimed");
      require(predictionStatus == PredictionStatus.ResultDeclared,"Result not declared");
      userClaimedReward[_user] = true;
      (uint[] memory _returnAmount, , uint[] memory _incentives, ) = getReturn(_user);
      // _user.transfer(returnAmount)
      uint256 i;
      for(i = 0;i< predictionAssets.length;i++) {
        _transferAsset(predictionAssets[i], _user, _returnAmount[i]);
      }
      for(i = 0;i < incentiveTokens.length; i++) {
        _transferAsset(incentiveTokens[i], _user, _incentives[i]);
      }
      pl.callClaimedEvent(_user, _returnAmount, predictionAssets, _incentives, incentiveTokens);
    }

    /**
    * @dev callback for result declaration of market.
    * @param myid The orcalize market result id.
    * @param result The current price of market currency.
    */
    function __callback(bytes32 myid, string memory result) public {
      // if(myid == closeMarketId) {
      //   _closeBet();
      // } else if(myid == marketResultId) {
      require ((myid==marketResultId));
      //Check oraclise address
      calculatePredictionResult(parseInt(result));
      // }
    }

}
