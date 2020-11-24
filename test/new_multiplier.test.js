const { assert } = require("chai");
const OwnedUpgradeabilityProxy = artifacts.require("OwnedUpgradeabilityProxy");
const Market = artifacts.require("MockMarket");
const Plotus = artifacts.require("MarketRegistry");
const Master = artifacts.require("Master");
const MemberRoles = artifacts.require("MemberRoles");
const PlotusToken = artifacts.require("MockPLOT");
const MockWeth = artifacts.require("MockWeth");
const MarketUtility = artifacts.require("MockConfig"); //mock
const MockConfig = artifacts.require("MockConfig");
const Governance = artifacts.require("Governance");
const AllMarkets = artifacts.require("MockAllMarkets");
const MockUniswapRouter = artifacts.require("MockUniswapRouter");
const MockUniswapV2Pair = artifacts.require("MockUniswapV2Pair");
const MockUniswapFactory = artifacts.require("MockUniswapFactory");
const TokenController = artifacts.require("MockTokenController");
// const MockchainLinkBTC = artifacts.require("MockChainLinkAggregator");
const web3 = Market.web3;
const ethAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const increaseTime = require("./utils/increaseTime.js").increaseTime;
const assertRevert = require("./utils/assertRevert").assertRevert;
const latestTime = require("./utils/latestTime").latestTime;
const encode = require("./utils/encoder.js").encode;
const gvProposal = require("./utils/gvProposal.js").gvProposalWithIncentiveViaTokenHolder;
const { toHex, toWei, toChecksumAddress } = require("./utils/ethTools");

// Multiplier Sheet
describe("new_Multiplier 1. Multiplier Sheet PLOT Prediction", () => {
    let masterInstance,
        plotusToken,
        marketConfig,
        MockUniswapRouterInstance,
        tokenControllerAdd,
        tokenController,
        plotusNewAddress,
        plotusNewInstance,
        governance,
        mockUniswapV2Pair,
        mockUniswapFactory,
        weth,
        allMarkets,
        marketUtility;
    let marketId = 1;
    let predictionPointsBeforeUser1, predictionPointsBeforeUser2, predictionPointsBeforeUser3, predictionPointsBeforeUser4;

    contract("AllMarkets", async function([user1, user2, user3, user4, user5]) {
        before(async () => {
            masterInstance = await OwnedUpgradeabilityProxy.deployed();
            masterInstance = await Master.at(masterInstance.address);
            plotusToken = await PlotusToken.deployed();
            tokenControllerAdd = await masterInstance.getLatestAddress(web3.utils.toHex("TC"));
            tokenController = await TokenController.at(tokenControllerAdd);
            plotusNewAddress = await masterInstance.getLatestAddress(web3.utils.toHex("PL"));
            memberRoles = await masterInstance.getLatestAddress(web3.utils.toHex("MR"));
            memberRoles = await MemberRoles.at(memberRoles);
            governance = await masterInstance.getLatestAddress(web3.utils.toHex("GV"));
            governance = await Governance.at(governance);
            MockUniswapRouterInstance = await MockUniswapRouter.deployed();
            mockUniswapFactory = await MockUniswapFactory.deployed();
            plotusNewInstance = await Plotus.at(plotusNewAddress);
            marketConfig = await plotusNewInstance.marketUtility();
            marketConfig = await MockConfig.at(marketConfig);
            weth = await MockWeth.deployed();
            await marketConfig.setWeth(weth.address);
            let newUtility = await MarketUtility.new();
            let existingMarkets = await plotusNewInstance.getOpenMarkets();
            let actionHash = encode("upgradeContractImplementation(address,address)", marketConfig.address, newUtility.address);
            await gvProposal(6, actionHash, await MemberRoles.at(await masterInstance.getLatestAddress(toHex("MR"))), governance, 2, 0);
            await increaseTime(604800);
            marketConfig = await MarketUtility.at(marketConfig.address);
            mockUniswapV2Pair = await MockUniswapV2Pair.new();
            await mockUniswapV2Pair.initialize(plotusToken.address, weth.address);
            await weth.deposit({ from: user4, value: toWei(10) });
            await weth.transfer(mockUniswapV2Pair.address, toWei(10), { from: user4 });
            await plotusToken.transfer(mockUniswapV2Pair.address, toWei(1000));
            initialPLOTPrice = 1000 / 10;
            initialEthPrice = 10 / 1000;
            await mockUniswapFactory.setPair(mockUniswapV2Pair.address);
            await mockUniswapV2Pair.sync();
            newUtility = await MarketUtility.new();
            existingMarkets = await plotusNewInstance.getOpenMarkets();
            actionHash = encode("upgradeContractImplementation(address,address)", marketConfig.address, newUtility.address);
            await gvProposal(6, actionHash, await MemberRoles.at(await masterInstance.getLatestAddress(toHex("MR"))), governance, 2, 0);
            await increaseTime(604800);
            marketConfig = await MarketUtility.at(marketConfig.address);
            allMarkets = await AllMarkets.new();
            await allMarkets.initiate(plotusToken.address, marketConfig.address);
            let date = await latestTime();
            await increaseTime(3610);
            date = Math.round(date);
            await marketConfig.setInitialCummulativePrice();
            await marketConfig.setAuthorizedAddress(allMarkets.address);
            let utility = await MarketUtility.at("0xCBc7df3b8C870C5CDE675AaF5Fd823E4209546D2");
            await utility.setAuthorizedAddress(allMarkets.address);
            await mockUniswapV2Pair.sync();
            await allMarkets.addInitialMarketTypesAndStart(date, "0x5e2aa6b66531142bEAB830c385646F97fa03D80a");
            await increaseTime(3610);
            await allMarkets.createMarket(0, 0);
        });
        it("1.1 Position without locking PLOT tokens", async () => {
            // await allMarkets.setMockPriceFlag(false);
            await marketConfig.setOptionPrice(1, 9);
            await marketConfig.setOptionPrice(2, 18);
            await marketConfig.setOptionPrice(3, 27);

            await plotusToken.transfer(user2, toWei("400"));
            await plotusToken.transfer(user3, toWei("100"));
            await plotusToken.transfer(user4, toWei("100"));
            await plotusToken.transfer(user5, toWei("10"));

            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user1 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user2 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user3 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user4 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user5 });

            await allMarkets.deposit(toWei(100), { from: user1 });
            await allMarkets.deposit(toWei(400), { from: user2 });
            await allMarkets.deposit(toWei(100), { from: user3 });
            await allMarkets.deposit(toWei(100), { from: user4 });
            await allMarkets.deposit(toWei(10), { from: user5 });

            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 2, { from: user1 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 2, { from: user2 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 1, { from: user3 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 3, { from: user4 });
            // await allMarkets.placePrediction(marketId, plotusToken.address, toWei("10"), 3, { from: user5 });
            console.error("*** One more case commented!! please uncomment ***");

            predictionPointsBeforeUser1 = parseFloat(await allMarkets.getUserPredictionPoints(user1, marketId, 2)) / 1000;
            predictionPointsBeforeUser2 = parseFloat(await allMarkets.getUserPredictionPoints(user2, marketId, 2)) / 1000;
            predictionPointsBeforeUser3 = parseFloat(await allMarkets.getUserPredictionPoints(user3, marketId, 1)) / 1000;
            predictionPointsBeforeUser4 = parseFloat(await allMarkets.getUserPredictionPoints(user4, marketId, 3)) / 1000;
            predictionPointsBeforeUser5 = parseFloat(await allMarkets.getUserPredictionPoints(user5, marketId, 3)) / 1000;
            console.log(
                predictionPointsBeforeUser1,
                predictionPointsBeforeUser2,
                predictionPointsBeforeUser3,
                predictionPointsBeforeUser4,
                predictionPointsBeforeUser5
            );

            await increaseTime(36001);
            await allMarkets.calculatePredictionResult(1, marketId);
            await increaseTime(36001);

            let returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][0]) / 1e18;
            let returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][0]) / 1e18;
            let returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][0]) / 1e18;
            let returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][0]) / 1e18;
            let returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][0]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][1]) / 1e18;
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][1]) / 1e18;
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][1]) / 1e18;
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][1]) / 1e18;
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][1]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[2]) / 1e18;
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[2]) / 1e18;
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[2]) / 1e18;
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[2]) / 1e18;
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[2]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5);

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );

            await allMarkets.withdraw(10, { from: user1 });
            await allMarkets.withdraw(10, { from: user2 });
            await allMarkets.withdraw(10, { from: user3 });
            await allMarkets.withdraw(10, { from: user4 });
            await allMarkets.withdraw(10, { from: user5 });

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );
            // assert.equal(predictionPointsBeforeUser1.toFixed(1), (55.5138941).toFixed(1));
            // assert.equal(predictionPointsBeforeUser2.toFixed(1), (932.6334208).toFixed(1));
            // assert.equal(predictionPointsBeforeUser3.toFixed(1), (366.391701).toFixed(1));
            // assert.equal(predictionPointsBeforeUser4.toFixed(1), (170.2426086).toFixed(1));
            // assert.equal(predictionPointsBeforeUser5.toFixed(1), (5.383543979).toFixed(1));
        });
        it("1.2 Positions After locking PLOT tokens", async () => {
            await allMarkets.createMarket(0, 0);
            marketId++;

            await marketConfig.setOptionPrice(1, 9);
            await marketConfig.setOptionPrice(2, 18);
            await marketConfig.setOptionPrice(3, 27);

            await plotusToken.transfer(user2, toWei(400 + 1600));
            await plotusToken.transfer(user3, toWei(100 + 1100));
            await plotusToken.transfer(user4, toWei(100 + 1100));
            await plotusToken.transfer(user5, toWei(10 + 1100));

            await plotusToken.approve(tokenController.address, toWei("10000"), { from: user1 });
            await plotusToken.approve(tokenController.address, toWei("10000"), { from: user2 });
            await plotusToken.approve(tokenController.address, toWei("10000"), { from: user3 });
            await plotusToken.approve(tokenController.address, toWei("10000"), { from: user4 });
            await plotusToken.approve(tokenController.address, toWei("10000"), { from: user5 });
            await tokenController.lock("0x534d", toWei("1100"), 86400 * 30, { from: user1 });
            await tokenController.lock("0x534d", toWei("1600"), 86400 * 30, { from: user2 });
            await tokenController.lock("0x534d", toWei("1100"), 86400 * 30, { from: user3 });
            await tokenController.lock("0x534d", toWei("1100"), 86400 * 30, { from: user4 });
            await tokenController.lock("0x534d", toWei("1100"), 86400 * 30, { from: user5 });

            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user1 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user2 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user3 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user4 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user5 });

            await allMarkets.deposit(toWei(100), { from: user1 });
            await allMarkets.deposit(toWei(400), { from: user2 });
            await allMarkets.deposit(toWei(100), { from: user3 });
            await allMarkets.deposit(toWei(100), { from: user4 });
            await allMarkets.deposit(toWei(10), { from: user5 });

            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 2, { from: user1 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 2, { from: user2 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 1, { from: user3 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 3, { from: user4 });
            // await allMarkets.placePrediction(marketId, plotusToken.address, toWei("10"), 3, { from: user5 });
            console.error("*** One more case commented!! please uncomment ***");

            predictionPointsBeforeUser1 = parseFloat(await allMarkets.getUserPredictionPoints(user1, marketId, 2)) / 1000;
            predictionPointsBeforeUser2 = parseFloat(await allMarkets.getUserPredictionPoints(user2, marketId, 2)) / 1000;
            predictionPointsBeforeUser3 = parseFloat(await allMarkets.getUserPredictionPoints(user3, marketId, 1)) / 1000;
            predictionPointsBeforeUser4 = parseFloat(await allMarkets.getUserPredictionPoints(user4, marketId, 3)) / 1000;
            predictionPointsBeforeUser5 = parseFloat(await allMarkets.getUserPredictionPoints(user5, marketId, 3)) / 1000;
            console.log(
                predictionPointsBeforeUser1,
                predictionPointsBeforeUser2,
                predictionPointsBeforeUser3,
                predictionPointsBeforeUser4,
                predictionPointsBeforeUser5
            );

            await increaseTime(36001);
            await allMarkets.calculatePredictionResult(1, marketId);
            await increaseTime(36001);

            let returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][0]);
            let returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][0]);
            let returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][0]);
            let returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][0]);
            let returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][0]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            returnUser4 = returnUser4 / 1e18;
            returnUser5 = returnUser5 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][1]);
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][1]);
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][1]);
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][1]);
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][1]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            returnUser4 = returnUser4 / 1e18;
            returnUser5 = returnUser5 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[2]);
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[2]);
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[2]);
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[2]);
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[2]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            returnUser4 = returnUser4 / 1e18;
            returnUser5 = returnUser5 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5);

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );
            (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18;

            await allMarkets.withdraw(10, { from: user1 });
            await allMarkets.withdraw(10, { from: user2 });
            await allMarkets.withdraw(10, { from: user3 });
            await allMarkets.withdraw(10, { from: user4 });
            await allMarkets.withdraw(10, { from: user5 });

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );
        });
    });
});

// Multiplier Sheet
describe("new_Multiplier 2. Multiplier Sheet ETH Prediction", () => {
    let masterInstance,
        plotusToken,
        marketConfig,
        MockUniswapRouterInstance,
        tokenControllerAdd,
        tokenController,
        plotusNewAddress,
        plotusNewInstance,
        governance,
        mockUniswapV2Pair,
        mockUniswapFactory,
        weth,
        allMarkets,
        marketUtility;
    let marketId = 1;
    let predictionPointsBeforeUser1, predictionPointsBeforeUser2, predictionPointsBeforeUser3, predictionPointsBeforeUser4;

    contract("AllMarkets", async function([user1, user2, user3, user4, user5, user6]) {
        before(async () => {
            masterInstance = await OwnedUpgradeabilityProxy.deployed();
            masterInstance = await Master.at(masterInstance.address);
            plotusToken = await PlotusToken.deployed();
            tokenControllerAdd = await masterInstance.getLatestAddress(web3.utils.toHex("TC"));
            tokenController = await TokenController.at(tokenControllerAdd);
            plotusNewAddress = await masterInstance.getLatestAddress(web3.utils.toHex("PL"));
            memberRoles = await masterInstance.getLatestAddress(web3.utils.toHex("MR"));
            memberRoles = await MemberRoles.at(memberRoles);
            governance = await masterInstance.getLatestAddress(web3.utils.toHex("GV"));
            governance = await Governance.at(governance);
            MockUniswapRouterInstance = await MockUniswapRouter.deployed();
            mockUniswapFactory = await MockUniswapFactory.deployed();
            plotusNewInstance = await Plotus.at(plotusNewAddress);
            marketConfig = await plotusNewInstance.marketUtility();
            marketConfig = await MockConfig.at(marketConfig);
            weth = await MockWeth.deployed();
            await marketConfig.setWeth(weth.address);
            let newUtility = await MarketUtility.new();
            let existingMarkets = await plotusNewInstance.getOpenMarkets();
            let actionHash = encode("upgradeContractImplementation(address,address)", marketConfig.address, newUtility.address);
            await gvProposal(6, actionHash, await MemberRoles.at(await masterInstance.getLatestAddress(toHex("MR"))), governance, 2, 0);
            await increaseTime(604800);
            marketConfig = await MarketUtility.at(marketConfig.address);
            mockUniswapV2Pair = await MockUniswapV2Pair.new();
            await mockUniswapV2Pair.initialize(plotusToken.address, weth.address);
            await weth.deposit({ from: user4, value: toWei(10) });
            await weth.transfer(mockUniswapV2Pair.address, toWei(10), { from: user4 });
            await plotusToken.transfer(mockUniswapV2Pair.address, toWei(1000));
            initialPLOTPrice = 1000 / 10;
            initialEthPrice = 10 / 1000;
            await mockUniswapFactory.setPair(mockUniswapV2Pair.address);
            await mockUniswapV2Pair.sync();
            newUtility = await MarketUtility.new();
            existingMarkets = await plotusNewInstance.getOpenMarkets();
            actionHash = encode("upgradeContractImplementation(address,address)", marketConfig.address, newUtility.address);
            await gvProposal(6, actionHash, await MemberRoles.at(await masterInstance.getLatestAddress(toHex("MR"))), governance, 2, 0);
            await increaseTime(604800);
            marketConfig = await MarketUtility.at(marketConfig.address);
            allMarkets = await AllMarkets.new();
            await allMarkets.initiate(plotusToken.address, marketConfig.address);
            let date = await latestTime();
            await increaseTime(3610);
            date = Math.round(date);
            await marketConfig.setInitialCummulativePrice();
            await marketConfig.setAuthorizedAddress(allMarkets.address);
            let utility = await MarketUtility.at("0xCBc7df3b8C870C5CDE675AaF5Fd823E4209546D2");
            await utility.setAuthorizedAddress(allMarkets.address);
            await mockUniswapV2Pair.sync();
            await allMarkets.addInitialMarketTypesAndStart(date, "0x5e2aa6b66531142bEAB830c385646F97fa03D80a");
            await increaseTime(3610);
            await allMarkets.createMarket(0, 0);
            await MockUniswapRouterInstance.setPrice("1000000000000000");
            await marketConfig.setPrice("1000000000000000");
        });
        it("2.1 Position without locking PLOT tokens", async () => {
            await marketConfig.setOptionPrice(1, 9);
            await marketConfig.setOptionPrice(2, 18);
            await marketConfig.setOptionPrice(3, 27);

            await allMarkets.deposit(0, { from: user1, value: toWei("10") });
            await allMarkets.deposit(0, { from: user2, value: toWei("10") });
            await allMarkets.deposit(0, { from: user3, value: toWei("10") });
            await allMarkets.deposit(0, { from: user4, value: toWei("10") });
            await allMarkets.deposit(0, { from: user5, value: toWei("10") });
            await allMarkets.deposit(0, { from: user6, value: toWei("0.2") });

            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 2, { from: user1 });
            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 2, { from: user2 });
            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 1, { from: user3 });
            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 3, { from: user4 });
            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 3, { from: user5 });
            // await allMarkets.placePrediction(marketId, ethAddress, toWei("0.2"), 3, { from: user6 });
            console.error("*** One more case commented!! please uncomment ***");

            predictionPointsBeforeUser1 = parseFloat(await allMarkets.getUserPredictionPoints(user1, marketId, 2)) / 1000;
            predictionPointsBeforeUser2 = parseFloat(await allMarkets.getUserPredictionPoints(user2, marketId, 2)) / 1000;
            predictionPointsBeforeUser3 = parseFloat(await allMarkets.getUserPredictionPoints(user3, marketId, 1)) / 1000;
            predictionPointsBeforeUser4 = parseFloat(await allMarkets.getUserPredictionPoints(user4, marketId, 3)) / 1000;
            predictionPointsBeforeUser5 = parseFloat(await allMarkets.getUserPredictionPoints(user5, marketId, 3)) / 1000;
            predictionPointsBeforeUser6 = parseFloat(await allMarkets.getUserPredictionPoints(user6, marketId, 3)) / 1000;
            console.log(
                predictionPointsBeforeUser1,
                predictionPointsBeforeUser2,
                predictionPointsBeforeUser3,
                predictionPointsBeforeUser4,
                predictionPointsBeforeUser5,
                predictionPointsBeforeUser6
            );

            await increaseTime(36001);
            await allMarkets.calculatePredictionResult(1, marketId);
            await increaseTime(36001);

            let returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][0]) / 1e18;
            let returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][0]) / 1e18;
            let returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][0]) / 1e18;
            let returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][0]) / 1e18;
            let returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][0]) / 1e18;
            let returnUser6 = parseFloat((await allMarkets.getReturn(user6, marketId))[0][0]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5, returnUser6);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][1]) / 1e18;
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][1]) / 1e18;
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][1]) / 1e18;
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][1]) / 1e18;
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][1]) / 1e18;
            returnUser6 = parseFloat((await allMarkets.getReturn(user6, marketId))[0][1]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5, returnUser6);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[2]) / 1e18;
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[2]) / 1e18;
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[2]) / 1e18;
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[2]) / 1e18;
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[2]) / 1e18;
            returnUser6 = parseFloat((await allMarkets.getReturn(user6, marketId))[2]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5, returnUser6);

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18,
                (await plotusToken.balanceOf(user6)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18,
                (await web3.eth.getBalance(user6)) / 1e18
            );

            await allMarkets.withdraw(10, { from: user1 });
            await allMarkets.withdraw(10, { from: user2 });
            await allMarkets.withdraw(10, { from: user3 });
            await allMarkets.withdraw(10, { from: user4 });
            await allMarkets.withdraw(10, { from: user5 });
            await allMarkets.withdraw(10, { from: user6 });

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18,
                (await plotusToken.balanceOf(user6)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18,
                (await web3.eth.getBalance(user6)) / 1e18
            );
            // assert.equal(predictionPointsBeforeUser1.toFixed(1), (55.5138941).toFixed(1));
            // assert.equal(predictionPointsBeforeUser2.toFixed(1), (932.6334208).toFixed(1));
            // assert.equal(predictionPointsBeforeUser3.toFixed(1), (366.391701).toFixed(1));
            // assert.equal(predictionPointsBeforeUser4.toFixed(1), (170.2426086).toFixed(1));
            // assert.equal(predictionPointsBeforeUser5.toFixed(1), (5.383543979).toFixed(1));
        });
        it("2.2 Positions After locking PLOT tokens", async () => {
            await allMarkets.createMarket(0, 0);
            marketId++;

            await marketConfig.setOptionPrice(1, 9);
            await marketConfig.setOptionPrice(2, 18);
            await marketConfig.setOptionPrice(3, 27);

            await plotusToken.transfer(user2, toWei(110000));
            await plotusToken.transfer(user3, toWei(1000));
            await plotusToken.transfer(user4, toWei(100000));
            await plotusToken.transfer(user5, toWei(200000));
            await plotusToken.transfer(user6, toWei(11000));

            await plotusToken.approve(tokenController.address, toWei("1000000"), { from: user1 });
            await plotusToken.approve(tokenController.address, toWei("1000000"), { from: user2 });
            await plotusToken.approve(tokenController.address, toWei("1000000"), { from: user3 });
            await plotusToken.approve(tokenController.address, toWei("1000000"), { from: user4 });
            await plotusToken.approve(tokenController.address, toWei("1000000"), { from: user5 });
            await plotusToken.approve(tokenController.address, toWei("1000000"), { from: user5 });
            await tokenController.lock("0x534d", toWei("110000"), 86400 * 30, { from: user1 });
            await tokenController.lock("0x534d", toWei("110000"), 86400 * 30, { from: user2 });
            await tokenController.lock("0x534d", toWei("1000"), 86400 * 30, { from: user3 });
            await tokenController.lock("0x534d", toWei("100000"), 86400 * 30, { from: user4 });
            await tokenController.lock("0x534d", toWei("200000"), 86400 * 30, { from: user5 });
            // await tokenController.lock("0x534d", toWei("11000"), 86400 * 30, { from: user6 });
            console.error("*** One more lock commented!! please uncomment ***");

            await allMarkets.deposit(0, { from: user1, value: toWei("10") });
            await allMarkets.deposit(0, { from: user2, value: toWei("10") });
            await allMarkets.deposit(0, { from: user3, value: toWei("10") });
            await allMarkets.deposit(0, { from: user4, value: toWei("10") });
            await allMarkets.deposit(0, { from: user5, value: toWei("10") });
            await allMarkets.deposit(0, { from: user6, value: toWei("0.2") });

            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 2, { from: user1 });
            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 2, { from: user2 });
            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 1, { from: user3 });
            await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 3, { from: user4 });
            // await allMarkets.placePrediction(marketId, ethAddress, toWei("10"), 3, { from: user5 });
            console.error("*** One more case commented!! please uncomment ***");
            // await allMarkets.placePrediction(marketId, ethAddress, toWei("0.2"), 3, { from: user6 });
            console.error("*** One more case commented!! please uncomment ***");

            predictionPointsBeforeUser1 = parseFloat(await allMarkets.getUserPredictionPoints(user1, marketId, 2)) / 1000;
            predictionPointsBeforeUser2 = parseFloat(await allMarkets.getUserPredictionPoints(user2, marketId, 2)) / 1000;
            predictionPointsBeforeUser3 = parseFloat(await allMarkets.getUserPredictionPoints(user3, marketId, 1)) / 1000;
            predictionPointsBeforeUser4 = parseFloat(await allMarkets.getUserPredictionPoints(user4, marketId, 3)) / 1000;
            predictionPointsBeforeUser5 = parseFloat(await allMarkets.getUserPredictionPoints(user5, marketId, 3)) / 1000;
            predictionPointsBeforeUser6 = parseFloat(await allMarkets.getUserPredictionPoints(user6, marketId, 3)) / 1000;
            console.log(
                predictionPointsBeforeUser1,
                predictionPointsBeforeUser2,
                predictionPointsBeforeUser3,
                predictionPointsBeforeUser4,
                predictionPointsBeforeUser5,
                predictionPointsBeforeUser6
            );

            await increaseTime(36001);
            await allMarkets.calculatePredictionResult(1, marketId);
            await increaseTime(36001);

            let returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][0]) / 1e18;
            let returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][0]) / 1e18;
            let returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][0]) / 1e18;
            let returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][0]) / 1e18;
            let returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][0]) / 1e18;
            let returnUser6 = parseFloat((await allMarkets.getReturn(user6, marketId))[0][0]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5, returnUser6);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][1]) / 1e18;
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][1]) / 1e18;
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][1]) / 1e18;
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[0][1]) / 1e18;
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[0][1]) / 1e18;
            returnUser6 = parseFloat((await allMarkets.getReturn(user6, marketId))[0][1]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5, returnUser6);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[2]) / 1e18;
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[2]) / 1e18;
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[2]) / 1e18;
            returnUser4 = parseFloat((await allMarkets.getReturn(user4, marketId))[2]) / 1e18;
            returnUser5 = parseFloat((await allMarkets.getReturn(user5, marketId))[2]) / 1e18;
            returnUser6 = parseFloat((await allMarkets.getReturn(user6, marketId))[2]) / 1e18;
            console.log(returnUser1, returnUser2, returnUser3, returnUser4, returnUser5, returnUser6);

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18,
                (await plotusToken.balanceOf(user6)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18,
                (await web3.eth.getBalance(user6)) / 1e18
            );

            await allMarkets.withdraw(10, { from: user1 });
            await allMarkets.withdraw(10, { from: user2 });
            await allMarkets.withdraw(10, { from: user3 });
            await allMarkets.withdraw(10, { from: user4 });
            await allMarkets.withdraw(10, { from: user5 });
            await allMarkets.withdraw(10, { from: user6 });

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18,
                (await plotusToken.balanceOf(user6)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18,
                (await web3.eth.getBalance(user6)) / 1e18
            );
        });
    });
});

describe("new_Multiplier 3. Bets Multiple options sheet", () => {
    let masterInstance,
        plotusToken,
        marketConfig,
        MockUniswapRouterInstance,
        tokenControllerAdd,
        tokenController,
        plotusNewAddress,
        plotusNewInstance,
        governance,
        mockUniswapV2Pair,
        mockUniswapFactory,
        weth,
        allMarkets,
        marketUtility;
    let marketId = 1;
    let predictionPointsBeforeUser1, predictionPointsBeforeUser2, predictionPointsBeforeUser3, predictionPointsBeforeUser4;

    contract("AllMarkets", async function([user1, user2, user3, user4, user5]) {
        before(async () => {
            masterInstance = await OwnedUpgradeabilityProxy.deployed();
            masterInstance = await Master.at(masterInstance.address);
            plotusToken = await PlotusToken.deployed();
            tokenControllerAdd = await masterInstance.getLatestAddress(web3.utils.toHex("TC"));
            tokenController = await TokenController.at(tokenControllerAdd);
            plotusNewAddress = await masterInstance.getLatestAddress(web3.utils.toHex("PL"));
            memberRoles = await masterInstance.getLatestAddress(web3.utils.toHex("MR"));
            memberRoles = await MemberRoles.at(memberRoles);
            governance = await masterInstance.getLatestAddress(web3.utils.toHex("GV"));
            governance = await Governance.at(governance);
            MockUniswapRouterInstance = await MockUniswapRouter.deployed();
            mockUniswapFactory = await MockUniswapFactory.deployed();
            plotusNewInstance = await Plotus.at(plotusNewAddress);
            marketConfig = await plotusNewInstance.marketUtility();
            marketConfig = await MockConfig.at(marketConfig);
            weth = await MockWeth.deployed();
            await marketConfig.setWeth(weth.address);
            let newUtility = await MarketUtility.new();
            let existingMarkets = await plotusNewInstance.getOpenMarkets();
            let actionHash = encode("upgradeContractImplementation(address,address)", marketConfig.address, newUtility.address);
            await gvProposal(6, actionHash, await MemberRoles.at(await masterInstance.getLatestAddress(toHex("MR"))), governance, 2, 0);
            await increaseTime(604800);
            marketConfig = await MarketUtility.at(marketConfig.address);
            mockUniswapV2Pair = await MockUniswapV2Pair.new();
            await mockUniswapV2Pair.initialize(plotusToken.address, weth.address);
            await weth.deposit({ from: user4, value: toWei(10) });
            await weth.transfer(mockUniswapV2Pair.address, toWei(10), { from: user4 });
            await plotusToken.transfer(mockUniswapV2Pair.address, toWei(1000));
            initialPLOTPrice = 1000 / 10;
            initialEthPrice = 10 / 1000;
            await mockUniswapFactory.setPair(mockUniswapV2Pair.address);
            await mockUniswapV2Pair.sync();
            newUtility = await MarketUtility.new();
            existingMarkets = await plotusNewInstance.getOpenMarkets();
            actionHash = encode("upgradeContractImplementation(address,address)", marketConfig.address, newUtility.address);
            await gvProposal(6, actionHash, await MemberRoles.at(await masterInstance.getLatestAddress(toHex("MR"))), governance, 2, 0);
            await increaseTime(604800);
            marketConfig = await MarketUtility.at(marketConfig.address);
            allMarkets = await AllMarkets.new();
            await allMarkets.initiate(plotusToken.address, marketConfig.address);
            let date = await latestTime();
            await increaseTime(3610);
            date = Math.round(date);
            await marketConfig.setInitialCummulativePrice();
            await marketConfig.setAuthorizedAddress(allMarkets.address);
            let utility = await MarketUtility.at("0xCBc7df3b8C870C5CDE675AaF5Fd823E4209546D2");
            await utility.setAuthorizedAddress(allMarkets.address);
            await mockUniswapV2Pair.sync();
            await allMarkets.addInitialMarketTypesAndStart(date, "0x5e2aa6b66531142bEAB830c385646F97fa03D80a");
            await increaseTime(3610);
            await allMarkets.createMarket(0, 0);
        });
        it("3.1 Scenario 1: player purchase 2 position in same option, in same currency and wins", async () => {

            await marketConfig.setOptionPrice(1, 9);
            await marketConfig.setOptionPrice(2, 18);
            await marketConfig.setOptionPrice(3, 27);

            await plotusToken.transfer(user2, toWei("400"));
            await plotusToken.transfer(user3, toWei("400"));

            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user1 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user2 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user3 });
            await allMarkets.deposit(toWei(500), { from: user1 });
            await allMarkets.deposit(toWei(400), { from: user2 });
            await allMarkets.deposit(toWei(400), { from: user3 });

            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 1, { from: user1 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 1, { from: user1 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 1, { from: user2 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 2, { from: user3 });

            predictionPointsBeforeUser1 = parseFloat(await allMarkets.getUserPredictionPoints(user1, marketId, 1)) / 1000;
            predictionPointsBeforeUser2 = parseFloat(await allMarkets.getUserPredictionPoints(user2, marketId, 1)) / 1000;
            predictionPointsBeforeUser3 = parseFloat(await allMarkets.getUserPredictionPoints(user3, marketId, 2)) / 1000;

            console.log(predictionPointsBeforeUser1, predictionPointsBeforeUser2, predictionPointsBeforeUser3);

            await increaseTime(36001);
            await allMarkets.calculatePredictionResult(1, marketId);
            await increaseTime(36001);

            let returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][0]);
            let returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][0]);
            let returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][0]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][1]);
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][1]);
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][1]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[2]);
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[2]);
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[2]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3);

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );

            await allMarkets.withdraw(10, { from: user1 });
            await allMarkets.withdraw(10, { from: user2 });
            await allMarkets.withdraw(10, { from: user3 });
            await allMarkets.withdraw(10, { from: user4 });
            await allMarkets.withdraw(10, { from: user5 });

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );

            // assert.equal(predictionPointsBeforeUser1.toFixed(1), (55.5138941).toFixed(1));
            // assert.equal(predictionPointsBeforeUser2.toFixed(1), (932.6334208).toFixed(1));
            // assert.equal(predictionPointsBeforeUser3.toFixed(1), (366.391701).toFixed(1));
            // assert.equal(predictionPointsBeforeUser4.toFixed(1), (170.2426086).toFixed(1));
            // assert.equal(predictionPointsBeforeUser5.toFixed(1), (5.383543979).toFixed(1));
        });
        it("3.2. Scenario 2", async () => {
            await allMarkets.createMarket(0, 0);
            marketId++;

            await marketConfig.setOptionPrice(1, 9);
            await marketConfig.setOptionPrice(2, 18);
            await marketConfig.setOptionPrice(3, 27);

            await plotusToken.transfer(user2, toWei("400"));
            await plotusToken.transfer(user3, toWei("400"));

            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user1 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user2 });
            await plotusToken.approve(allMarkets.address, toWei("10000"), { from: user3 });
            await allMarkets.deposit(toWei(500), { from: user1 });
            await allMarkets.deposit(toWei(400), { from: user2 });
            await allMarkets.deposit(toWei(400), { from: user3 });

            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("100"), 2, { from: user1 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 2, { from: user1 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 1, { from: user2 });
            await allMarkets.placePrediction(marketId, plotusToken.address, toWei("400"), 2, { from: user3 });

            predictionPointsBeforeUser1 = parseFloat(await allMarkets.getUserPredictionPoints(user1, marketId, 1)) / 1000;
            predictionPointsBeforeUser2 = parseFloat(await allMarkets.getUserPredictionPoints(user2, marketId, 1)) / 1000;
            predictionPointsBeforeUser3 = parseFloat(await allMarkets.getUserPredictionPoints(user3, marketId, 2)) / 1000;

            console.log(predictionPointsBeforeUser1, predictionPointsBeforeUser2, predictionPointsBeforeUser3);

            await increaseTime(36001);
            await allMarkets.calculatePredictionResult(1, marketId);
            await increaseTime(36001);

            let returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][0]);
            let returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][0]);
            let returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][0]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[0][1]);
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[0][1]);
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[0][1]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3);

            returnUser1 = parseFloat((await allMarkets.getReturn(user1, marketId))[2]);
            returnUser2 = parseFloat((await allMarkets.getReturn(user2, marketId))[2]);
            returnUser3 = parseFloat((await allMarkets.getReturn(user3, marketId))[2]);
            returnUser1 = returnUser1 / 1e18;
            returnUser2 = returnUser2 / 1e18;
            returnUser3 = returnUser3 / 1e18;
            console.log(returnUser1, returnUser2, returnUser3);

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );

            await allMarkets.withdraw(10, { from: user1 });
            await allMarkets.withdraw(10, { from: user2 });
            await allMarkets.withdraw(10, { from: user3 });
            await allMarkets.withdraw(10, { from: user4 });
            await allMarkets.withdraw(10, { from: user5 });

            console.log(
                (await plotusToken.balanceOf(user1)) / 1e18,
                (await plotusToken.balanceOf(user2)) / 1e18,
                (await plotusToken.balanceOf(user3)) / 1e18,
                (await plotusToken.balanceOf(user4)) / 1e18,
                (await plotusToken.balanceOf(user5)) / 1e18
            );
            console.log(
                (await web3.eth.getBalance(user1)) / 1e18,
                (await web3.eth.getBalance(user2)) / 1e18,
                (await web3.eth.getBalance(user3)) / 1e18,
                (await web3.eth.getBalance(user4)) / 1e18,
                (await web3.eth.getBalance(user5)) / 1e18
            );
        });
    });
});
