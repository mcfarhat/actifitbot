var fs = require("fs");
const steem = require('steem');

const hive = require('@hiveio/hive-js');

var _ = require('lodash');
const axios = require('axios');
const dsteem = require('dsteem');

const dhive = require('@hiveio/dhive');

const moment = require('moment')

getConfig();

const client = new dsteem.Client(config.active_node);
const hiveClient = new dhive.Client(config.alt_hive_nodes);
		
var config;

let th_id = -1;

steem.api.setOptions({ url: config.active_node });

hive.api.setOptions({ url: config.active_hive_node });

var STEEMIT_100_PERCENT = 10000;
var STEEMIT_VOTE_REGENERATION_SECONDS = (5 * 60 * 60 * 24);
var HOURS = 60 * 60;

 var steemPrice;
 var rewardBalance;
 var recentClaims;
 var currentUserAccount;
 var votePowerReserveRate;
 var totalVestingFund;
 var totalVestingShares;
 var steem_per_mvests;
 var sbd_print_percentage;
 var botNames;
 let properties
 let totalVests
 let totalSteem
 let hiveProps
 let totalHive
 let totalHiveVests
 
 function setProperNode(bchain){
	if (bchain == "STEEM"){
		return steem
	}else{
		return hive
	}
 }
 
 async function getAccountData(account_name, bchain){
	let account = null;
	let chainLnk = await setProperNode(bchain);
	//attempt to load account data
	try{
		let account_res = await chainLnk.api.getAccountsAsync([config.account]); 
		account = account_res[0];
	}catch(err){
		console.log(err);
	}
	return account;
 }
 
 async function validateAccountLogin(username, priv_pkey, bchain){
	let chainLnk = await setProperNode(bchain);
	console.log('validateAccountLogin');
	let account_res = await chainLnk.api.getAccountsAsync([username]);
	console.log(account_res[0]);
	let pub_pkey = account_res[0].posting.key_auths[0][0];
	try{ 
		let res = await chainLnk.auth.wifIsValid(priv_pkey, pub_pkey);
		//console.log(res);
		return {result: res, account: account_res[0]};
	}catch(err){ 
		console.log(err);
		return {result:false};
	}
 }
 
 async function processSteemTrx(operation, userKey, bchain){
	console.log('utils processSteemTrx');
	console.log(operation);
	const ops = [ operation ];
	console.log('>>>>>>>>>>>> selected bchain <<<<<<<<<<');
	console.log(bchain);
	let chainLnk = await setProperNode(bchain);
	let tx = await chainLnk.broadcast.sendAsync( 
		   { operations: ops, extensions: [] },
		   { posting: userKey }
		).catch(err => {
			console.log(err.message);
			return {error: err.message};
		});
	
	console.log(tx);
	return {tx: tx};
 }
 
 function updateSteemVariables(bchain) {
	 let chainLnk = setProperNode(bchain);
     chainLnk.api.getRewardFund("post", function (e, t) {
         console.log(e,t);
         rewardBalance = parseFloat(t.reward_balance.replace(" STEEM", "").replace(" HIVE", ""));
         recentClaims = t.recent_claims;
     });
     chainLnk.api.getCurrentMedianHistoryPrice(function (e, t) {
         steemPrice = parseFloat(t.base.replace(" SBD", "")) / parseFloat(t.quote.replace(" STEEM", "").replace(" HIVE", ""));
     });
     chainLnk.api.getDynamicGlobalProperties(function (e, t) {
         votePowerReserveRate = t.vote_power_reserve_rate;
         totalVestingFund = parseFloat(t.total_vesting_fund_steem.replace(" STEEM", "").replace(" HIVE", ""));
         totalVestingShares = parseFloat(t.total_vesting_shares.replace(" VESTS", ""));
		 steem_per_mvests = ((totalVestingFund / totalVestingShares) * 1000000);
		 sbd_print_percentage = t.sbd_print_rate / 10000
		 console.log(steem_per_mvests);
		 console.log(sbd_print_percentage);
     });

     setTimeout(updateSteemVariables, 180 * 1000, bchain)
 }
 // updateSteemVariables();

 /*function getVotingPower(account) {
     var voting_power = account.voting_power;
     var last_vote_time = new Date((account.last_vote_time) + 'Z');
     var elapsed_seconds = (new Date() - last_vote_time) / 1000;
     var regenerated_power = Math.round((STEEMIT_100_PERCENT * elapsed_seconds) / STEEMIT_VOTE_REGENERATION_SECONDS);
     var current_power = Math.min(voting_power + regenerated_power, STEEMIT_100_PERCENT);
     return current_power;
 }*/
 
	//fixed implementation of proper voting power calculation
	function getVotingPower(account) {
		const totalShares = parseFloat(account.vesting_shares) + parseFloat(account.received_vesting_shares) - parseFloat(account.delegated_vesting_shares) - parseFloat(account.vesting_withdraw_rate);

            const elapsed = Math.floor(Date.now() / 1000) - account.voting_manabar.last_update_time;
            const maxMana = totalShares * 1000000;
            // 432000 sec = 5 days
            let currentMana = parseFloat(account.voting_manabar.current_mana) + elapsed * maxMana / 432000;

            if (currentMana > maxMana) {
                currentMana = maxMana;
            }

            const currentManaPerc = currentMana * 100 / maxMana;
			console.log(currentManaPerc);
			console.log(account.name);
		return currentManaPerc;
	}
	
	//implement a get current Resource Credits function for normal operations consumption
	async function getRC(account_name){
		var data={"jsonrpc":"2.0","id":1,"method":"condenser_api.get_account_count","params":{}};
		//return new Promise(function(fulfill,reject){
			//var request = require("request");
			let location = config.active_node;
			var response = await axios.post(location, {"jsonrpc":"2.0","id":1,"method":"rc_api.find_rc_accounts","params":{"accounts":[account_name]}});
			
			console.log(response.data.result.rc_accounts);
			
			
			
			const STEEM_RC_MANA_REGENERATION_SECONDS =432000;
			const estimated_max = parseFloat(response.data.result.rc_accounts["0"].max_rc);
			const current_mana = parseFloat(response.data.result.rc_accounts["0"].rc_manabar.current_mana);
			const last_update_time = parseFloat(response.data.result.rc_accounts["0"].rc_manabar.last_update_time);
			const diff_in_seconds = Math.round(Date.now()/1000-last_update_time);
			let estimated_mana = (current_mana + diff_in_seconds * estimated_max / STEEM_RC_MANA_REGENERATION_SECONDS);
			if (estimated_mana > estimated_max)
				estimated_mana = estimated_max;
			const estimated_pct = estimated_mana / estimated_max * 100;
			const res= {"current_mana": current_mana, "last_update_time": last_update_time,
				  "estimated_mana": estimated_mana, "estimated_max": estimated_max, "estimated_pct": estimated_pct.toFixed(2),"fullin":timeTilFullPower(estimated_pct*100)};
			return res;
			
		//});
	}
	
	//function handles confirming if AFIT from SE were received
	async function confirmAFITXTransition (targetUser, txid, amount, bchain, standardAfit) {
		getConfig();
		//track attempts for timeout
		let attempts = 1;
		let max_attempts = 15;
		return new Promise((resolve, reject) => {
			th_id = setInterval(async function(){
				if (attempts < max_attempts){
					attempts += 1;
					console.log('Check Move');
					//let's call the service by S-E
					let url = new URL(config.hive_engine_afitx_trx);
					if (standardAfit == 1){
						url = new URL(config.hive_engine_afit_trx);
					}
					if (bchain == 'STEEM'){
						url = new URL(config.steem_engine_afitx_trx);
						if (standardAfit == 1){
							url = new URL(config.steem_engine_afit_trx);
						}
					}
					//connect with our service to confirm AFIT received to proper wallet
					try{
						let se_connector = await fetch(url);
						let trx_entries = await se_connector.json();
						console.log(trx_entries);
						let match_trx;
						
						//check if we have a proper entry matching user transfer
						if (match_trx = trx_entries.find(trx => (trx.from == targetUser && trx.quantity == amount && trx.transactionId == txid))) {
							//found match, let's make sure transaction is recent enough
							console.log('found match');
							paymentFound = true;
							if (paymentFound){
								//need to look again
								console.log('found');
								clearInterval(th_id);
								resolve(match_trx);
							}
						}
					}catch(err){
						console.log(err);
					}
				}else{
					//return error
					resolve(null);
				}
			}, 5000);
		});
	}
	
	async function proceedAfitxMove (targetAcct, amount, chain, standardAfit){

		let transId = 'ssc-mainnet-hive';
		//let targetBchain = 'STEEM';
		//other option is moving tokens from H-E to S-E
		if (chain == 'STEEM'){
		//if (this.cur_bchain == 'STEEM'){
			transId = 'ssc-mainnet1';
			//targetBchain = 'HIVE';
		}
		let tokenSymbol = 'AFITX';
		if (standardAfit == 1){
			tokenSymbol = 'AFIT';
		}
		
		let json_data = {
			contractName: 'tokens',
			contractAction: 'transfer',
			contractPayload: {
				symbol: tokenSymbol,
				to: targetAcct,
				quantity: amount.toFixed(6),//needs to be string and a max of 6 digits supported
				memo: ''
			}
		}
		
		//send out transaction to blockchain
		let chainLnk = await setProperNode(chain);
		let tx = await chainLnk.broadcast.customJsonAsync(
				config.active_key, 
				[ config.account ] , 
				[], 
				transId, 
				JSON.stringify(json_data)
			).catch(err => {
				console.log(err.message);
		});
	}
	
	//function handles confirming if AFIT from SE were received
	async function confirmSEAFITReceived (targetUser, bchain) {
		getConfig();
		//track attempts for timeout
		let attempts = 1;
		let max_attempts = 15;
		return new Promise((resolve, reject) => {
			th_id = setInterval(async function(){
				if (attempts < max_attempts){
					attempts += 1;
					console.log('Check AFIT Power Up');
					//let's call the service by S-E
					let url = new URL(config.hive_engine_trans_acct_his);
					if (bchain == 'STEEM'){
						url = new URL(config.steem_engine_trans_acct_his);
					}
					//connect with our service to confirm AFIT received to proper wallet
					try{
						let se_connector = await fetch(url);
						let trx_entries = await se_connector.json();
						
						let match_trx;
						
						//check if we have a proper entry matching user transfer
						if (match_trx = trx_entries.find(trx => trx.from == targetUser)) {
							//found match, let's make sure transaction is recent enough
							console.log('found match');
							paymentFound = true;
							if (paymentFound){
								//need to look again
								console.log('found');
								clearInterval(th_id);
								resolve(match_trx);
							}
						}
					}catch(err){
						console.log(err);
					}
				}else{
					//return error
					resolve(null);
				}
			}, 5000);
		});
	}
	
	//function handles confirming if payment was received
	async function confirmPaymentReceived (req, bchain) {
		getConfig();
		return new Promise((resolve, reject) => {
			th_id = setInterval(async function(){
				let chainLnk = await setProperNode(bchain);
				console.log('check funds');
				chainLnk.api.getAccountHistory(config.signup_account, -1, 3000, (err, transactions) => {
					let tx_id = '';
					let paymentFound = false;
					for (let txs of transactions) {
						let op = txs[1].op
						//check if we received a transfer to our target account
						//if we found a transfer operation sent to our target account, with the correct memo and the proper amount, proceed
						if (op[0] === 'transfer'){
							let sentAmount = op[1].amount.split(' ')[0];
							let sentCur = op[1].amount.split(' ')[1];
							if (op[1].to === config.signup_account 
								&& op[1].memo === req.query.memo 
								&& sentAmount >= (parseFloat(req.query.steem_invest)-0.1) 
								&& sentCur === req.query.sent_cur){  
								console.log('in');
								console.log(op[1]);
								
								let now = moment(new Date()); //todays date
								let end = moment(txs[1].timestamp); // last update date
								let duration = moment.duration(now.diff(end));
								let hrs = duration.asHours();
								//transaction needs to have been concluded within 5 hours.
								if (hrs < 5){
									tx_id = txs[1].trx_id;
									paymentFound = true;
									break;
								}
							}
						}
					}
					if (paymentFound){
						//need to look again
						console.log('found');
						clearInterval(th_id);
						resolve(tx_id);
					}
				});
			}, 5000);
		});
	}
	
	//function handles confirming if payment was received
	async function confirmPaymentReceivedPassword (req, bchain) {
		getConfig();
		console.log('confirmPaymentReceivedPassword');
		return new Promise((resolve, reject) => {
			let th_id = setInterval(async function(){
				console.log('check funds');
				console.log(bchain);
				let chainLnk = await setProperNode(bchain);
				chainLnk.api.getAccountHistory(config.exchange_account, -1, 300, (err, transactions) => {
					let tx_id = '';
					let paymentFound = false;
					for (let txs of transactions) {
						let op = txs[1].op
						//check if we received a transfer to our target account
						//if we found a transfer operation sent to our target account, with the correct memo and the proper amount, proceed
						if (op[0] === 'transfer'){
							//console.log('transfer op ');
							//console.log(op[1]);
							let sentAmount = op[1].amount.split(' ')[0];
							if (op[1].to === config.exchange_account && op[1].from === req.query.from && sentAmount >= 1){  
								console.log('in');
								console.log(op[1]);
								//console.log(txs);
								/*let now = moment(new Date()); //todays date
								let end = moment(txs[1].timestamp); // last update date
								let duration = moment.duration(now.diff(end));
								let hrs = duration.asHours();
								//transaction needs to have been concluded within 5 hours.
								if (hrs < 24){*/
									tx_id = txs[1].trx_id;
									paymentFound = true;
									break;
								//}
							}
						}
					}
					if (paymentFound){
						//need to look again
						console.log('found');
						clearInterval(th_id);
						resolve(tx_id);
					}
				});
			}, 5000);
		});
	}
	
	//function handles confirming if payment was received
	async function confirmPaymentReceivedBuy (req, bchain) {
		getConfig();
		console.log('confirmPaymentReceivedBuy');
		return new Promise((resolve, reject) => {
			let th_id = setInterval(async function(){
				console.log('check buy funds');
				let chainLnk = await setProperNode(bchain);
				chainLnk.api.getAccountHistory(config.buy_account, -1, 800, (err, transactions) => {
					let tx_id = '';
					let paymentFound = false;
					for (let txs of transactions) {
						let op = txs[1].op
						//check if we received a transfer to our target account
						//if we found a transfer operation sent to our target account, with the correct sender and the proper amount, proceed
						if (op[0] === 'transfer'){
							let sentAmount = op[1].amount.split(' ')[0];
							if (op[1].to === config.buy_account && op[1].from === req.query.from && sentAmount === req.query.steem_amount){  
								console.log('in');
								console.log(op[1]);
								//console.log(txs);
								
								let now = moment(new Date()); //todays date
								let end = moment(txs[1].timestamp); // last update date
								let duration = moment.duration(now.diff(end));
								let hrs = duration.asHours();
								//transaction needs to have been concluded within 5 hours.
								if (hrs < 5){
									tx_id = txs[1].trx_id;
									paymentFound = true;
									break;
								}
							}
						}
					}
					if (paymentFound){
						//need to look again
						console.log('found');
						clearInterval(th_id);
						resolve(tx_id);
					}
				});
			}, 5000);
		});
	}
	
	
	
	//function handles claiming spots for accounts
	async function claimDiscountedAccount(chain){
		console.log('claimDiscountedAccount');
		if (typeof config == 'undefined' || config == null){
			getConfig();
		}
		const claim_op = [
			'claim_account',
			{
				creator: config.account,
				fee: '0.000 STEEM',
				extensions: [],
			}
		];
		const ops = [claim_op];
		
		let result = '';
		let outcSteem = false;
		let outcHive = false;
		if (!chain || chain == 'STEEM'){
			
			try{
				const privateKey = dsteem.PrivateKey.fromString(
							config.active_key
						);
				result = await client.broadcast.sendOperations(ops, privateKey);
				console.log('success');
				outcSteem = true;
			}catch(err){
				console.log(err);
				outcSteem = false;
			}
		}
		if (!chain || chain == 'HIVE'){
			try{
				const privateKey = dhive.PrivateKey.fromString(
							config.active_key
						);
				result = await hiveClient.broadcast.sendOperations(ops, privateKey);
				console.log('success');
				outcHive = true;
			}catch(err){
				console.log(err);
				outcHive = false;
			}
		}
		return (outcSteem || outcHive);
	}
	
	//function handles creating accounts via discounted claimed spots or normal paid method
	async function createAccount (username, password, chain){
		if (typeof config == 'undefined' || config == null){
			getConfig();
		}
		
		if (!chain || chain == 'STEEM'){
			//check if account exists		
			const _account = await client.database.call('get_accounts', [[username]]);
			//account not available to register
			if (_account.length>0) {
				console.log('account already exists');
				console.log(_account);
				return false;
			}
		}
			
		if (!chain || chain == 'HIVE'){
			//check if account exists		
			const _account = await hiveClient.database.call('get_accounts', [[username]]);
			//account not available to register
			if (_account.length>0) {
				console.log('account already exists');
				console.log(_account);
				return false;
			}
		}	
		
		console.log('account available');
					
		
		//container for required ops
		let ops = [];
		let hiveOps = [];
		
		//if we have discounted accounts still available, let's do that, otherwise let's pay for account
		let creator = config.account;
		
		let steemAccountSuccess = false;
		let hiveAccountSuccess = false;
		
		if (!chain || chain == 'STEEM'){
			
			//create keys for new account
			const ownerKey = dsteem.PrivateKey.fromLogin(username, password, 'owner');
			const activeKey = dsteem.PrivateKey.fromLogin(username, password, 'active');
			const postingKey = dsteem.PrivateKey.fromLogin(username, password, 'posting');
			let memoKey = dsteem.PrivateKey.fromLogin(username, password, 'memo').createPublic();
			
			//create auth values for passing to account creation
			const ownerAuth = {
				weight_threshold: 1,
				account_auths: [],
				key_auths: [[ownerKey.createPublic(), 1]],
			};
			const activeAuth = {
				weight_threshold: 1,
				account_auths: [],
				key_auths: [[activeKey.createPublic(), 1]],
			};
			const postingAuth = {
				weight_threshold: 1,
				account_auths: [],
				key_auths: [[postingKey.createPublic(), 1]],
			};
			
			
			const _creator_account = await client.database.call('get_accounts', [
				[creator],
			]);
			console.log('current pending claimed accounts: ' + _creator_account[0].pending_claimed_accounts);
			
			if (_creator_account[0].pending_claimed_accounts > 0) {
			
				//the create discounted account operation
				const create_op = [
					'create_claimed_account',
					{
						creator: creator,
						new_account_name: username,
						owner: ownerAuth,
						active: activeAuth,
						posting: postingAuth,
						memo_key: memoKey,
						json_metadata: '',
						extensions: [],
					}
				];
				ops.push(create_op);
			}else{
			
				const create_op = [
					'account_create',
					{
						fee: '3.000 STEEM',
						creator: creator,
						new_account_name: username,
						owner: ownerAuth,
						active: activeAuth,
						posting: postingAuth,
						memo_key: memoKey,
						json_metadata: '',
						extensions: [],
					}
				];
				ops.push(create_op);
			}
			
			const privateKey = dhive.PrivateKey.fromString(config.active_key);
			//proceed executing the selected operation(s)
			let result = '';
			try{
				result = await client.broadcast.sendOperations(ops, privateKey);
				console.log('success');
				steemAccountSuccess = true;
			}catch(err){
				console.log(err);
				steemAccountSuccess = false;
			}
		}
		
		if (!chain || chain == 'HIVE'){
			const _creator_account = await hiveClient.database.call('get_accounts', [
				[creator],
			]);
			console.log('current pending claimed accounts: ' + _creator_account[0].pending_claimed_accounts);
			
			//create keys for new account
			const ownerKey = dhive.PrivateKey.fromLogin(username, password, 'owner');
			const activeKey = dhive.PrivateKey.fromLogin(username, password, 'active');
			const postingKey = dhive.PrivateKey.fromLogin(username, password, 'posting');
			let memoKey = dhive.PrivateKey.fromLogin(username, password, 'memo').createPublic();
			
			//create auth values for passing to account creation
			const ownerAuth = {
				weight_threshold: 1,
				account_auths: [],
				key_auths: [[ownerKey.createPublic(), 1]],
			};
			const activeAuth = {
				weight_threshold: 1,
				account_auths: [],
				key_auths: [[activeKey.createPublic(), 1]],
			};
			const postingAuth = {
				weight_threshold: 1,
				account_auths: [],
				key_auths: [[postingKey.createPublic(), 1]],
			};
			
			if (_creator_account[0].pending_claimed_accounts > 0) {		
			
				//the create discounted account operation
				const create_op = [
					'create_claimed_account',
					{
						creator: creator,
						new_account_name: username,
						owner: ownerAuth,
						active: activeAuth,
						posting: postingAuth,
						memo_key: memoKey,
						json_metadata: '',
						extensions: [],
					}
				];
				hiveOps.push(create_op);
			}else{
			
				const create_op = [
					'account_create',
					{
						fee: '3.000 STEEM',
						creator: creator,
						new_account_name: username,
						owner: ownerAuth,
						active: activeAuth,
						posting: postingAuth,
						memo_key: memoKey,
						json_metadata: '',
						extensions: [],
					}
				];
				hiveOps.push(create_op);
			}
			
			const privateKey = dhive.PrivateKey.fromString(config.active_key);
			//proceed executing the selected operation(s)
			let result = '';
			try{
				result = await hiveClient.broadcast.sendOperations(hiveOps, privateKey);
				console.log('success');
				hiveAccountSuccess = true;
			}catch(err){
				console.log(err);
				hiveAccountSuccess = false;
			}
		}
		return (steemAccountSuccess || hiveAccountSuccess);
	}

	//function handles delegating to a specific account
	async function delegateToAccount (delegatee, steemPowerAmount, chain){
		if (typeof config == 'undefined' || config == null){
			getConfig();
		}
		const privateKey = dhive.PrivateKey.fromString(
			config.full_pay_ac_key
		);
		
		let result = '';
		let steemDg = false;
		let hiveDg = false;
		if (!chain || chain == 'STEEM'){
			try{
				//grab matching amount of Vests to delegate
				let matchingVests = await steemPowerToVests(steemPowerAmount);
				console.log('matchingVests:'+matchingVests);
				const op = [
					'delegate_vesting_shares',
					{
						delegator: config.full_pay_benef_account,
						delegatee: delegatee,
						vesting_shares: matchingVests+' VESTS',
					},
				];
				
				result = await client.broadcast.sendOperations([op], privateKey);
				console.log('Included in block:'+ result.block_num);
				console.log('returning back');
				steemDg = true;
			}catch(err){
				console.log(err);
				console.log('returning back err');
				steemDg = false;
			}
		}
		if (!chain || chain == 'HIVE'){
			try{
				//grab matching amount of Vests to delegate
				let matchingHiveVests = await hivePowerToVests(steemPowerAmount);
				console.log('matchingHiveVests:'+matchingHiveVests);
				const op = [
					'delegate_vesting_shares',
					{
						delegator: config.full_pay_benef_account,
						delegatee: delegatee,
						vesting_shares: matchingHiveVests+' VESTS',
					},
				];
				
				result = await hiveClient.broadcast.sendOperations([op], privateKey);
				console.log('Included in block:'+ result.block_num);
				console.log('returning back');
				hiveDg = true;
			}catch(err){
				console.log(err);
				console.log('returning back err');
				hiveDg = false;
			}
		}
		return (steemDg || hiveDg);
	}

 function getVoteRShares(voteWeight, account, power) {
     if (!account) {
         return;
     }

     if (rewardBalance && recentClaims && steemPrice && votePowerReserveRate) {

         var effective_vesting_shares = Math.round(getVestingShares(account) * 1000000);
         var voting_power = account.voting_power;
         var weight = voteWeight * 100;
         var last_vote_time = new Date((account.last_vote_time) + 'Z');


         var elapsed_seconds = (new Date() - last_vote_time) / 1000;
         var regenerated_power = Math.round((STEEMIT_100_PERCENT * elapsed_seconds) / STEEMIT_VOTE_REGENERATION_SECONDS);
         var current_power = power || Math.min(voting_power + regenerated_power, STEEMIT_100_PERCENT);
         var max_vote_denom = votePowerReserveRate * STEEMIT_VOTE_REGENERATION_SECONDS / (60 * 60 * 24);
         var used_power = Math.round((current_power * weight) / STEEMIT_100_PERCENT);
         used_power = Math.round((used_power + max_vote_denom - 1) / max_vote_denom);

         var rshares = Math.round((effective_vesting_shares * used_power) / (STEEMIT_100_PERCENT))

         return rshares;

     }
 }

 function getVoteValue(voteWeight, account, power, steem_price) {
     if (!account) {
         return;
     }
     if (rewardBalance && recentClaims && steemPrice && votePowerReserveRate) {
         var voteValue = getVoteRShares(voteWeight, account, power)
           * rewardBalance / recentClaims
           * steemPrice;

         return voteValue;

     }
 }

 function getVoteValueUSD(vote_value, sbd_price) {
  const steempower_value = vote_value * 0.5
  const sbd_print_percentage_half = (0.5 * sbd_print_percentage)
  const sbd_value = vote_value * sbd_print_percentage_half
  const steem_value = vote_value * (0.5 - sbd_print_percentage_half)
  return (sbd_value * sbd_price) + steem_value + steempower_value
 }

function timeTilFullPower(cur_power){
     return (STEEMIT_100_PERCENT - cur_power) * STEEMIT_VOTE_REGENERATION_SECONDS / STEEMIT_100_PERCENT;
 }
 
 function timeTilKickOffVoting(cur_power){
     return (parseInt(config.vp_kickstart) - cur_power) * STEEMIT_VOTE_REGENERATION_SECONDS / parseInt(config.vp_kickstart);
 }

 function getVestingShares(account) {
     var effective_vesting_shares = parseFloat(account.vesting_shares.replace(" VESTS", ""))
       + parseFloat(account.received_vesting_shares.replace(" VESTS", ""))
       - parseFloat(account.delegated_vesting_shares.replace(" VESTS", ""));
     return effective_vesting_shares;
 }

 function getCurrency(amount) {
   return amount.substr(amount.indexOf(' ') + 1);
 }
 
 function loadUserList(location, callback) {
  if(!location) {
    if(callback)
      callback(null);

    return;
  }

  if (location.startsWith('http://') || location.startsWith('https://')) {
    // Require the "request" library for making HTTP requests
    var request = require("request");

    request.get(location, function (e, r, data) {
      try {
        if(callback)
          callback(data.replace(/[\r]/g, '').split('\n'));
      } catch (err) {
        console.log('Error loading blacklist from: ' + location + ', Error: ' + err);

        if(callback)
          callback(null);
      }
    });
  } else if (fs.existsSync(location)) {
    if(callback)
      callback(fs.readFileSync(location, "utf8").replace(/[\r]/g, '').split('\n'));
  } else if(callback)
    callback([]);
}

function format(n, c, d, t) {
  var c = isNaN(c = Math.abs(c)) ? 2 : c,
      d = d == undefined ? "." : d,
      t = t == undefined ? "," : t,
      s = n < 0 ? "-" : "",
      i = String(parseInt(n = Math.abs(Number(n) || 0).toFixed(c))),
      j = (j = i.length) > 3 ? j % 3 : 0;
   return s + (j ? i.substr(0, j) + t : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + t) + (c ? d + Math.abs(n - i).toFixed(c).slice(2) : "");
 }

 function toTimer(ts) {
   var h = Math.floor(ts / HOURS);
   var m = Math.floor((ts % HOURS) / 60);
   var s = Math.floor((ts % 60));
   return padLeft(h, 2) + ':' + padLeft(m, 2) + ':' + padLeft(s, 2);
 }
 
 function toHrMn(ts) {
   var h = Math.floor(ts / HOURS);
   var m = Math.floor((ts % HOURS) / 60);
   return padLeft(h, 2) + 'hr(s):' + padLeft(m, 2) + 'min(s)';
 }

 function padLeft(v, d) {
   var l = (v + '').length;
   if (l >= d) return v + '';
   for(var i = l; i < d; i++)
     v = '0' + v;
   return v;
 }

 async function loadBots() {
  var query = await axios.get('https://steembottracker.net/bid_bots');
  var bidBots = query.data;
  var query = await axios.get('https://steembottracker.net/other_bots');
  var otherBots = query.data;
  // console.log(bidBots);
  // console.log(otherBots);
  var allBots = bidBots.concat(otherBots);
  botNames = _.map(allBots, 'name');
  // console.log(botNames);
  return botNames;
 }

 // the weight param is actually 100*1,000 at max to consume 20% VP
 // with 100 being the max 100% per single vote, and 1,000 being the max potentially used votes
 // so if we were to only consume 10 % of our VP, the weight would be set at 50,000 instead of default value of 100,000
 function calculateVotes(posts, weight) {
	console.log('calculateVotes');
  if(typeof weight == 'undefined') {
    weight = 100000;
  }
  var data = {};
  var x = 0;
  // Rate multiplier post count  
  var rmc = _.countBy(posts, 'rate_multiplier');
  console.log(rmc);
  _.forEach(rmc, function(value, key) {
    x += key * value;
  });
  console.log(x);
  data.power_per_vote = Math.floor(weight / x);
  return data
 }

 function filterPosts(posts, banned_users) {
  var results = Array();
  let config = getConfig();
  //takes care of making sure if we reached too far back in history
   var dateSurpassed = 0;

  
  for(var i = 0; i < posts.length; i++) {
    var post = posts[i];

    // Check if post category is main tag
    if (post.category != config.main_tag) {
      console.log('Post does not match category tag. ' + post.url);
      continue;
    }
    //check if account was voted
    let voted = _.findIndex(post.active_votes, ['voter', config.account]);
    if (voted == -1) {
      console.log('Post was not voted. ' + post.url);
      continue;
    }
    // Check if account is beneficiary 
    var benefit = checkBeneficiary(post);
    
    if(!benefit)
      continue;

	
	//check if user is banned
	var user_banned = false;
	for (var n = 0; n < banned_users.length; n++) {
		if (post.author == banned_users[n].user){
			console.log('User '+post.author+' is banned, skipping his post:' + post.url);
			user_banned = true;
			break;
		}
	  }   
	if (user_banned) continue;
	
	//go back only to predefined days in history
	if((new Date() - new Date(post.created + 'Z')) >= (config.max_days * 24 * 60 * 60 * 1000)) {
			dateSurpassed += 1;
			continue;
		}
	 
    results.push(post);
  }
  //if we got to old posts and received at least 10 posts, inform calling function that no need to move forward further
  if (results.length == 0 && dateSurpassed>10){
	return -1;
  }
  return results;
    
 }

 function checkBeneficiary(post) {
  let config = getConfig();
   // Check if account is beneficiary 
   var benefit = 0;
   for (var x = 0; x < post.beneficiaries.length; x++) {
     for (var n = 0; n < config.beneficiaries.length; n++) {
       if (post.beneficiaries[x].account === config.beneficiaries[n])
         benefit ++;
     }          
     if (benefit === config.beneficiaries.length) {
       benefit = true;
       break;
     }
   }
   if(!benefit)
     return false;

   return true;

 }
 
  /**
  * function handles mapping and calculating relevant score
  * params: 
  * * 2D array providing couplets of rules
  * * factor multipier for data
  * * current value to compare
  */
 function calcScore(rules_array, factor, value){
	var result;
	//console.log("rules_array.length:"+rules_array.length);
	for (var i=0; i<rules_array.length; i++){
		var rule = rules_array[i];
		//console.log(value<=rule[0]);
		if (value<=rule[0]){
			result = factor * rule[1];
			break;
		}else{
			//default until we find a larger range that fits better
			result = factor * rule[1];
		}
	}
	//console.log('result:'+result);
	return result;
}

 function log(msg, name) { 
  if (!name)
    var name = 'log';
  console.log(new Date().toString() + ' - ' + msg); 
  fs.appendFileSync( name + '.log', new Date().toString() + ' - ' + msg + "\n");
 }

 function getConfig() {
  if (config)
    return config;
  else {
    console.log('I get config');
    config = JSON.parse(fs.readFileSync("config.json"));
    return config;
  }
 }

 async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

/* generate & return a random int value between min and max */
function generateRandomNumber(min , max) {
    
   let random_number = Math.random() * (max - min) + min;
   return Math.floor(random_number);
}

let newestTxId = -1;
let totalSBD = 0
let totalSp = 0
let total_STEEM = 0

let curTotalSBD = 0
let curTotalSp = 0
let curTotalSTEEM = 0

let producerSPRewards = 0

let authorRewardedSBD = 0
let authorRewardedSp = 0
let authorRewardedSTEEM = 0

let accountSTEEMTransfer = 0;
let accountSBDTransfer = 0;

let accountSTEEMTransferIn = 0
let accountSBDTransferIn = 0

let limit = 5000;
let txStart = -1;
let opsArr = [];

function resetVals(){
	totalSBD = 0
	totalSp = 0
	total_STEEM = 0

	curTotalSBD = 0
	curTotalSp = 0
	curTotalSTEEM = 0

	producerSPRewards = 0
	
	authorRewardedSBD = 0
	authorRewardedSp = 0
	authorRewardedSTEEM = 0
	
	accountSTEEMTransfer = 0
	accountSBDTransfer = 0
	
	accountSBDTransferIn = 0
	accountSTEEMTransferIn = 0
}

//lookupAccountPay();

async function lookupAccountPay (){
	
	const ONE_DAY = 1;
	const ONE_WEEK = 7;
	const ONE_MONTH = 30;
	const ONE_YEAR = 365;
	
	//when is our start day: 1 is yesterday, 10 is 10 days ago
	let start_days = 15;
	let lookup_days = ONE_MONTH;
	
	let today = moment().utc().startOf('date').toDate()
	let start = moment(today).subtract(start_days, 'days').toDate()
	let to = moment(start).subtract(lookup_days, 'days').toDate()

	//bring the action
	console.log('start date:'+start)
	console.log('************actifit rewards***************')
	await getAccountPayTransactions('actifit', start, to, lookup_days);
	//console.log('append actifit.pay rewards:'+start)
	//await getAccountPayTransactions('actifit.pay', start, to);
	
	txStart = -1;
	console.log('***********append actifit.funds rewards**********')
	await getAccountPayTransactions('actifit.funds', start, to, lookup_days);
	
	txStart = -1;
	console.log('***********append actifit.pay rewards**********')
	await getAccountPayTransactions('actifit.pay', start, to, lookup_days);
	
	txStart = -1;
	console.log('***********append actifit.exchange rewards**********')
	await getAccountPayTransactions('actifit.exchange', start, to, lookup_days);
	
	txStart = -1;
	console.log('***********append actifit.signup rewards**********')
	await getAccountPayTransactions('actifit.signup', start, to, lookup_days);	
}

async function getAccountPayTransactions (account, start, end, period) {
  
  start = moment(start).format()
  end = moment(end).format()
    
  // Query account history for delegations
  properties = await client.database.getDynamicGlobalProperties()
  totalSteem = Number(properties.total_vesting_fund_steem.split(' ')[0])
  totalVests = Number(properties.total_vesting_shares.split(' ')[0])
  
  //console.log(properties);
  if (txStart != -1 && txStart < limit){
	limit = txStart;
  }
  const transactions = await client.database.call('get_account_history', [account, txStart, limit])
  transactions.reverse()
  
  console.log("newestTxId:"+transactions[0][0]);
  
  for (let txs of transactions) {
    let date = moment(txs[1].timestamp).format()
	//console.log(date >= end)
	//console.log(date <= start)
	
    if (date >= end && date <= start) {
	  //console.log(txs[0]);
      let op = txs[1].op
	  
	  //console.log(op[0]);
      // Look for beneficiary payments
	  if (!opsArr.includes(op[0])){
		opsArr.push(op[0]);
	  }
      if (op[0] === 'comment_benefactor_reward') {
		//console.log('---------------------------------------');
		//console.log(op);
		//console.log(op[1]);
        let rewardedSP = parseFloat(vestsToSteemPower(op[1].vesting_payout).toFixed(3)) 
		totalSp += rewardedSP;
		//console.log("rewardedSP:"+rewardedSP);
		//calculate dollar value
		//let steemInUSD = rewardedSP * steemPrice;
		//console.log("steemInUSD:"+steemInUSD);
				
		let rewardedSTEEM = parseFloat(op[1].steem_payout.split(' ')[0])
		total_STEEM += rewardedSTEEM ;
		//console.log("rewardedSTEEM:"+rewardedSTEEM);
		
		//let steemPureInUSD = rewardedSTEEM * steemPrice;

		
		let rewardedSBD = parseFloat(op[1].sbd_payout.split(' ')[0])
		
		//console.log("rewardedSBD:"+rewardedSBD);
		
		totalSBD += rewardedSBD;
		
		//calculate dollar value
		//let sbdInUSD = rewardedSBD * sbdPrice;

      }else if (op[0] === 'producer_reward') {
		//console.log('date:'+txs[1].timestamp+'op:'+op[1]);
		let rewardedSP = parseFloat(vestsToSteemPower(op[1].vesting_shares.split(' ')[0]).toFixed(3))
		producerSPRewards += rewardedSP;
	  }else if (op[0] === 'curation_reward') {
		//console.log(op[1]);
		let rewardedSP = parseFloat(vestsToSteemPower(op[1].reward.split(' ')[0]).toFixed(3)) 
		curTotalSp += rewardedSP;
		
		//let rewardedSTEEM = parseFloat(op[1].steem_payout.split(' ')[0])
		//curTotalSTEEM += rewardedSTEEM ;
		
		
		//let rewardedSBD = parseFloat(op[1].sbd_payout.split(' ')[0])
		
		//console.log("rewardedSBD:"+rewardedSBD);
		
		//curTotalSBD += rewardedSBD;
	  }else if (op[0] === 'author_reward') {
	    //console.log('caught one author_reward');
		//console.log(op);
		
		authorRewardedSBD += parseFloat(op[1].sbd_payout.split(' ')[0])
		authorRewardedSp += parseFloat(vestsToSteemPower(op[1].vesting_payout.split(' ')[0]).toFixed(3))
		authorRewardedSTEEM += parseFloat((op[1].steem_payout.split(' ')[0]))
	  }else if (op[0] === 'comment_reward') {
	    console.log('comment_reward FOUND');
		console.log(op);
	  }else if (op[0] === 'transfer' && op[1].from === account && 
		(op[1].to !== 'bittrex' && !op[1].to.includes('actifit'))){//skip bittrex and actifit account transfers
		let amountWithCur = op[1].amount;
		let amount = amountWithCur.split(' ')[0]
		let cur = amountWithCur.split(' ')[1]
		if (cur == 'SBD'){
			accountSBDTransfer += parseFloat(amount)
		}else{
			accountSTEEMTransfer += parseFloat(amount)
		}
	  }else if (op[0] === 'transfer' && op[1].to === account && 
		(!op[1].from.includes('actifit'))){//skip intra account transfer
		let amountWithCur = op[1].amount;
		let amount = amountWithCur.split(' ')[0]
		let cur = amountWithCur.split(' ')[1]
		if (cur == 'SBD'){
			accountSBDTransferIn += parseFloat(amount)
		}else{
			accountSTEEMTransferIn += parseFloat(amount)
		}
	  }
    } else if (date < end){ 
		break
	}
  }
  
  let lastTx = transactions[transactions.length - 1]
  //console.log(lastTx[0]);
  let lastDate = moment(lastTx[1].timestamp).format()
  // console.log(lastDate)
  if (lastDate >= end && (txStart == -1 || txStart > limit)){ 
	txStart = lastTx[0];
	return getAccountPayTransactions(account, start, end, period)
  }
  console.log ('querying complete');
  console.log ('>>period: '+period + ' days')
  console.log ('---benefic---');
  console.log ('totalSP:'+totalSp);
  if (period>0 && totalSp>0){
	console.log ('AVG Daily:'+totalSp/period);
  }
  console.log ('total_STEEM:'+total_STEEM);
  if (period>0 && total_STEEM>0){
	console.log ('AVG Daily:'+total_STEEM/period);
  }
  console.log ('totalSBD:'+totalSBD);
  if (period>0 && totalSBD>0){
    console.log ('AVG Daily:'+totalSBD/period);
  }
  console.log ('---curation---');
  console.log ('totalSP:'+curTotalSp);
  if (period>0 && curTotalSp>0){
    console.log ('AVG Daily:'+curTotalSp/period);
  }
  
  console.log ('---author---');
  console.log ('totalSP:'+authorRewardedSp);
  console.log ('total_STEEM:'+authorRewardedSTEEM);
  console.log ('totalSBD:'+authorRewardedSBD);
  if (period>0 && curTotalSp>0){
    console.log ('AVG Daily:'+curTotalSp/period);
  }
  
  //console.log ('totalSTEEM:'+curTotalSTEEM);
 // console.log ('totalSBD:'+curTotalSBD);
  console.log ('---witness---');
  console.log ('producerSPRewards:'+producerSPRewards);
  if (period>0 && producerSPRewards>0){
    console.log ('AVG Daily:'+producerSPRewards/period);
  }
  console.log ('---totals---');
  let comSP = parseFloat(totalSp.toFixed(3))+parseFloat(curTotalSp.toFixed(3))+parseFloat(producerSPRewards.toFixed(3))+parseFloat(total_STEEM.toFixed(3))
				+ parseFloat(authorRewardedSp.toFixed(3))+parseFloat(authorRewardedSTEEM.toFixed(3)) + parseFloat(accountSTEEMTransferIn.toFixed(3));
  console.log ('totalSTEEM:'+comSP.toFixed(3));
  if (period>0 && comSP>0){
    console.log ('AVG Daily:'+comSP/period);
  }
  //console.log ('totalSTEEM:'+totalSTEEM.toFixed(3));
  let comSBD = parseFloat(totalSBD.toFixed(3))+parseFloat(authorRewardedSBD.toFixed(3))+ parseFloat(accountSBDTransferIn.toFixed(3));;
  console.log ('totalSBD:'+comSBD);
  if (period>0 && comSBD>0){
    console.log ('AVG Daily:'+comSBD/period);
  }
  console.log ('---delegator pay---');
  console.log ('delegatorPaySTEEM:'+accountSTEEMTransfer);
  console.log ('delegatorPaySBD:'+accountSBDTransfer);
  console.log ('------------');
  //console.log (opsArr);
}


function vestsToSteemPower (vests) {
  vests = Number(vests.split(' ')[0])
  const steemPower = (totalSteem * (vests / totalVests))
  return steemPower
}

//function handles conversting SP to Vests
async function steemPowerToVests (steemPower) {

  if (isNaN(totalSteem) || isNaN(totalVests) ){
	properties = await client.database.getDynamicGlobalProperties()
	totalSteem = Number(properties.total_vesting_fund_steem.split(' ')[0])
	totalVests = Number(properties.total_vesting_shares.split(' ')[0])
  }
  return parseFloat(steemPower * totalVests / totalSteem).toFixed(6);
}

//function handles conversting SP to Vests
async function hivePowerToVests (hivePower) {

  if (isNaN(totalHive) || isNaN(totalHiveVests) ){
	hiveProps = await hiveClient.database.getDynamicGlobalProperties()
	totalHive = Number(hiveProps.total_vesting_fund_steem.split(' ')[0])
	totalHiveVests = Number(hiveProps.total_vesting_shares.split(' ')[0])
  }
  return parseFloat(hivePower * totalHiveVests / totalHive).toFixed(6);
}

function sortArrLodash (arrToSort) {
	return _.orderBy(arrToSort, function (o) { return new Number(o.balance)},['desc']);
}

function removeArrMatchLodash (arrToClean, arrToMatch, field) {
	let removedEntries = _.remove(arrToClean, obj => arrToMatch.includes(obj[field]));
	//console.log("removedEntries");
	//console.log(removedEntries);
	return arrToClean;
}

async function rewardPost(post_url, vp, bchain){
	//extract author and permalink from full url
	//check if string ends with /, remove it
	if (post_url.slice(-1) == '/'){
		post_url = post_url.slice(0, -1);
	}
	//last portion is URL
	let permalink = post_url.split('/').reverse()[0];
	//before last portion is author, and remove the starting @
	let author = post_url.split('/').reverse()[1].replace('@','');
	let chainLnk = await setProperNode(bchain);
	//cast vote
	let result = await chainLnk.broadcast.voteAsync(
							config.rewards_account_pkey, //postingWIF
							config.rewards_account, // Voter
							author, // Author
							permalink, // Permlink
							parseFloat(vp)*100, // Weight (10000 = 100%)
						);
	return  result;
}

async function verifyGadgetPayTransaction(userA, gadget_id, item_price, item_price_alt, tx_type, block_num, tx_id, bchain){
	let trx;
	console.log('verifyGadgetTransaction');
	try{
		if (bchain == 'STEEM'){
			trx = await client.database.getTransaction({id: tx_id, block_num: block_num});
		}else{
			trx = await hiveClient.database.getTransaction({id: tx_id, block_num: block_num});
		}
		console.log(trx);
		if (trx && trx.operations
			&& trx.operations.length > 0){
				console.log(trx.operations[0][1]);
				let trx_details = trx.operations[0][1];
				let amnt = trx_details.amount.split(' ')[0];;
				//let json_data = JSON.parse(trx_details.json);
				console.log(trx_details);
				if (trx_details.to == config.gadget_buy_account && trx_details.memo == tx_type + ':' + gadget_id
					&& (amnt >= item_price || amnt >= item_price_alt)){
					return {'success': true, 'amount_hive': amnt};
				}
		}
	}catch(err){
		console.log(err);
	}
	return false;
}

async function verifyGadgetTransaction(userA, gadget_id, tx_type, block_num, tx_id, bchain){
	let trx;
	console.log('verifyGadgetTransaction');
	try{
		if (bchain == 'STEEM'){
			trx = await client.database.getTransaction({id: tx_id, block_num: block_num});
		}else if (bchain == 'HIVE'){
			trx = await hiveClient.database.getTransaction({id: tx_id, block_num: block_num});
		}
		console.log(trx);
		if (trx && trx.operations
			&& trx.operations.length > 0){
				console.log(trx.operations[0][1]);
				let trx_details = trx.operations[0][1];
				let json_data = JSON.parse(trx_details.json);
				console.log(trx_details);
				if (trx_details.required_posting_auths.length > 0 && trx_details.required_posting_auths[0] == userA
					&& json_data.transaction == tx_type && json_data.gadget == gadget_id){
					return true;
				}
		}
	}catch(err){
		console.log(err);
	}
	return false;
}

async function verifyFriendTransaction(userA, userB, tx_type, block_num, tx_id, bchain){
	let trx 
	try{
		if (bchain == 'STEEM'){
			trx = await client.database.getTransaction({id: tx_id, block_num: block_num});
		}else if (bchain == 'HIVE'){
			trx = await hiveClient.database.getTransaction({id: tx_id, block_num: block_num});
		}
		if (trx && trx.operations
			&& trx.operations.length > 0){
				console.log(trx.operations[0][1]);
				let trx_details = trx.operations[0][1];
				let json_data = JSON.parse(trx_details.json);
				console.log(trx_details);
				if (trx_details.required_posting_auths.length > 0 && trx_details.required_posting_auths[0] == userA
					&& json_data.transaction == tx_type && json_data.target == userB){
					return true;
				}
			
		}
	}catch(err){
		console.log(err);
	}
	return false;
}

async function sendNotification(db, user, action_taker, type, details, url){
	let notification_entry = {
		user: user,
		action_taker: action_taker,
		type: type,
		details: details,
		url: url,
		date: new Date(),
		status: 'unread',
	};
	try{
		let transaction = await db.collection('notifications').insert(notification_entry);
		console.log('success inserting notification data');
		return true;
	}catch(err){
		console.log('error');
		return false;
	}
}


async function grabLastDrawData(db){
	let lastDraw = await db.collection('gadget_buy_prize_draw').find().sort({'drawDate': -1}).toArray();
	let drawData = {};
	if (Array.isArray(lastDraw) && lastDraw.length > 0){
		let start = moment(lastDraw[0].drawDate).utc().startOf('date').toDate();
		let nextDrawDate = moment(start).add(config.contestBuyLen, 'days').toDate();
		lastDraw[0].nextDrawDate = nextDrawDate;
		drawData = lastDraw[0];
	}else{
		let start = moment(config.gadgetPrizeInitDate).utc().startOf('date').toDate();
		let nextDrawDate = moment(start).add(config.contestBuyLen, 'days').toDate();
		drawData = {'drawDate': start, 'nextDrawDate': nextDrawDate};
	}
	return drawData;
}

async function getGadgetBuyTickets(db){
	let drawData = await grabLastDrawData(db);
	
	let startDate = moment(drawData.drawDate).format('YYYY-MM-DD');
	
	//let endDate = moment(moment(startDate).utc().subtract(config.contestBuyLen, 'days').toDate()).format('YYYY-MM-DD');
	
	console.log("startDate:"+startDate);//+" endDate:"+endDate);
	
	let query = {
		date: {
			$gte: new Date(startDate),	
		}
	}
	
	let result = await db.collection('gadget_buy_tickets').find(query).toArray();
	return result;
}

 module.exports = {
   updateSteemVariables: updateSteemVariables,
   getVotingPower: getVotingPower,
   getRC: getRC,
   claimDiscountedAccount: claimDiscountedAccount,
   getVoteValueUSD: getVoteValueUSD,
   getVoteValue: getVoteValue,
   timeTilFullPower: timeTilFullPower,
   timeTilKickOffVoting: timeTilKickOffVoting,
   getVestingShares: getVestingShares,
   loadUserList: loadUserList,
   getCurrency: getCurrency,
   format: format,
   toTimer: toTimer,
   toHrMn: toHrMn,
   log: log,
   calcScore: calcScore,
   calculateVotes: calculateVotes,
   filterPosts: filterPosts,
   getConfig: getConfig,
   loadBots: loadBots,
   checkBeneficiary: checkBeneficiary,
   asyncForEach: asyncForEach,
   generateRandomNumber: generateRandomNumber,
   lookupAccountPay: lookupAccountPay,
   vestsToSteemPower: vestsToSteemPower,
   createAccount: createAccount,
   delegateToAccount: delegateToAccount,
   confirmPaymentReceived: confirmPaymentReceived,
   confirmPaymentReceivedPassword: confirmPaymentReceivedPassword,
   confirmSEAFITReceived: confirmSEAFITReceived,
   confirmPaymentReceivedBuy: confirmPaymentReceivedBuy,
   sortArrLodash: sortArrLodash,
   getAccountData: getAccountData,
   rewardPost: rewardPost,
   verifyFriendTransaction: verifyFriendTransaction,
   verifyGadgetTransaction: verifyGadgetTransaction,
   removeArrMatchLodash: removeArrMatchLodash,
   validateAccountLogin: validateAccountLogin,
   processSteemTrx: processSteemTrx,
   sendNotification: sendNotification,
   confirmAFITXTransition: confirmAFITXTransition,
   proceedAfitxMove: proceedAfitxMove,
   verifyGadgetPayTransaction: verifyGadgetPayTransaction,
   getGadgetBuyTickets: getGadgetBuyTickets,
   grabLastDrawData: grabLastDrawData
 }
