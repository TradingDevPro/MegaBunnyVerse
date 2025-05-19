// claim.js – 가스 수수료 최적화, 메시지 영어화, gameStarted 상태 업데이트 등, MegaETH용

// ... (전역 RPC 스로틀, safeSend, waitRc, bigIntReplacer, ABI 로딩, getSlot, parseSeeds 는 이전과 동일하게 유지 - Ethers v5 기준) ...
// (단, waitRc 메시지, alert 메시지 등 영어화)

// 전역 RPC 요청 스로틀 (0.7초당 1회)
if (window.ethereum?.request) {
    const _origRequest = window.ethereum.request.bind(window.ethereum);
    let _lastRequestTime = 0;
    window.ethereum.request = async (args) => {
        const now = Date.now();
        const elapsedTime = now - _lastRequestTime;
        const throttleTime = 700; 
        if (elapsedTime < throttleTime) {
            await new Promise(r => setTimeout(r, throttleTime - elapsedTime));
        }
        _lastRequestTime = Date.now();
        return _origRequest(args);
    };
  }
  
  let _lastSendTime = 0;
  async function safeSend(fn) {
    const now = Date.now();
    const elapsedTime = now - _lastSendTime;
    const throttleTime = 700; 
    if (elapsedTime < throttleTime) {
        await new Promise(r => setTimeout(r, throttleTime - elapsedTime));
    }
    _lastSendTime = Date.now();
    return fn();
  }
  
  async function waitRc(hash, max = 15, gap = 1500) { 
    if (!signer) throw new Error("Signer not available for getTransactionReceipt");
    for (let i = 0; i < max; i++) {
        try {
            if (typeof showLoading === 'function') { 
                showLoading(`Verifying transaction... (${i + 1}/5) TX: ${hash.slice(0,10)}`);
            }
            const rc = await signer.provider.getTransactionReceipt(hash); 
            if (rc) return rc;
            await new Promise(r => setTimeout(r, gap));
        } catch (err) {
            const msg = err.data?.message || err.message || "";
            if (msg.includes("25/second") || (err.info?.error?.code === -32007) || (err.error?.code === -32007) ) {
                console.warn(`waitRc: RPC limit, waiting 5s (attempt ${i + 1}/${max})`);
                if (typeof showLoading === 'function') showLoading(`RPC request limit, retrying... (${i + 1}/${max})`);
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }
            console.error(`waitRc: Error (attempt ${i + 1}/${max})`, err);
            throw err;
        }
    }
    throw Error("⏳ Transaction receipt timeout for " + hash.slice(0, 10) + "...");
  }
  
  function bigIntReplacer(key, value) {
    if (typeof value === 'bigint') return value.toString() + 'n'; 
    if (ethers.BigNumber.isBigNumber(value)) return value.toString(); 
    return value;
  }
  
  let _slotMachineAbi = null;
  let __slot = null; 
  let deployAddrCache = null;
  let _cachedAbiJsonStringForSlot = null;
  
  async function loadContractAbi() {
    if (_slotMachineAbi) return _slotMachineAbi;
    try {
        const response = await fetch("./SlotMachineABI.json"); 
        if (!response.ok) throw new Error(`HTTP error ${response.status} fetching ABI`);
        const artifact = await response.json();
        if (!artifact.abi) throw new Error("ABI key not found in artifact");
        _slotMachineAbi = artifact.abi;
        console.log("[ABI Loader] SlotMachine ABI loaded successfully.");
        return _slotMachineAbi;
    } catch (error) {
        console.error("❌ Failed to load SlotMachine ABI:", error);
        if (typeof hideLoading === 'function') hideLoading();
        alert("Failed to load contract ABI. Please refresh or contact support.");
        return null;
    }
  }
  
  async function getSlot() {
    if (!signer) throw new Error("🦊 Wallet not connected (signer not ready)");
    
    const loadedFullAbi = await loadContractAbi();
    if (!loadedFullAbi) throw Error("ABI not loaded.");
  
    // window.__SLOT_ADDR__는 wallet.js의 loadDeployInfo에서 설정됨
    let addr = window.__SLOT_ADDR__; 
    if (!addr) {
        // deploy.json에서 직접 읽는 로직은 wallet.js의 loadDeployInfo로 통합됨
        // 여기서는 window.__SLOT_ADDR__가 설정되어 있기를 기대
        throw Error("SlotMachine contract address not found (window.__SLOT_ADDR__ is undefined). Ensure deploy.json is loaded.");
    }
  
    if (!addr || !ethers.utils.isAddress(addr)) { 
        throw new Error("Invalid SlotMachine address: " + String(addr));
    }
  
    const newAbiJsonString = JSON.stringify(loadedFullAbi);
    if (!__slot || __slot.address !== addr || _cachedAbiJsonStringForSlot !== newAbiJsonString) { 
        console.log("[getSlot] Creating/Recreating SlotMachine instance. Address:", addr);
        __slot = new ethers.Contract(addr, loadedFullAbi, signer); 
        _cachedAbiJsonStringForSlot = newAbiJsonString;
    }
    return __slot;
  }
  
  async function parseSeeds(rc) {
    const slot = await getSlot();
    const evFragment = slot.interface.getEvent("FreeSeedsGranted"); 
    if (!evFragment) throw new Error("Event 'FreeSeedsGranted' not found in ABI.");
    
    const contractAddress = slot.address.toLowerCase(); 
    
    const eventTopic = slot.interface.getEventTopic(evFragment);
    const log = rc.logs.find(l => 
        l.address.toLowerCase() === contractAddress && 
        l.topics[0] === eventTopic
    );
  
    if (!log) throw Error("Log for event 'FreeSeedsGranted' not found in receipt.");
    if (!log.data || log.data === "0x" || log.data.length < 10) throw Error(`Invalid log.data for FreeSeedsGranted: ${log.data}.`);
  
    try {
        const decodedLog = slot.interface.decodeEventLog(evFragment, log.data, log.topics); 
        const seedsArray = decodedLog.seeds || (Array.isArray(decodedLog) && decodedLog.length > 1 ? decodedLog[1] : undefined); 
        
        if (!Array.isArray(seedsArray)) throw new Error("Failed to decode 'seeds' array from FreeSeedsGranted event.");
        return seedsArray.map(bn => bn.toString());
    } catch (error) { console.error("[parseSeeds] Error decoding event:", error); throw error; }
  }
  
  
  let isClaimFree = false, lastFree = 0;
  let isBuying = false, lastBuy = 0;
  let isClaimToken = false, lastToken = 0;
  
  async function getDynamicGasOptions(estimatedGasLimit) {
    let txOptions = {};
    if (provider) { // provider는 wallet.js에서 설정된 전역 변수
        try {
            const feeData = await provider.getFeeData();
            console.log("[GasOptions] Current Fee Data (gwei):", {
                gasPrice: feeData.gasPrice ? ethers.utils.formatUnits(feeData.gasPrice, "gwei") : "N/A",
                // EIP-1559 (ethers v5는 주로 gasPrice 사용, 네트워크/지갑이 지원하면 maxFeePerGas 등도 사용 가능)
                maxFeePerGas: feeData.maxFeePerGas ? ethers.utils.formatUnits(feeData.maxFeePerGas, "gwei") : "N/A",
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, "gwei") : "N/A",
            });
  
            // Ethers v5는 일반적으로 gasPrice를 우선 사용. 
            // MegaETH 네트워크가 EIP-1559를 선호하고 MetaMask가 이를 지원하면 feeData에 관련 필드가 채워짐.
            // 하드햇 설정에서 MegaETH에 maxFeePerGas와 maxPriorityFeePerGas를 설정해두었으므로, 지갑이 이를 활용할 수 있음.
            // 여기서는 getFeeData()가 반환하는 값을 기반으로 유연하게 설정.
            if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
                // EIP-1559 스타일. 약간의 버퍼를 추가.
                const increasedPriorityFee = feeData.maxPriorityFeePerGas.mul(120).div(100); // 20% 증가
                txOptions = {
                    maxPriorityFeePerGas: increasedPriorityFee,
                    maxFeePerGas: feeData.maxFeePerGas.add(increasedPriorityFee.sub(feeData.maxPriorityFeePerGas)), // base fee + increased tip
                };
                console.log("[GasOptions] Using EIP-1559 Tx Options (maxFeePerGas, maxPriorityFeePerGas Gwei):", 
                  ethers.utils.formatUnits(txOptions.maxFeePerGas, "gwei"), 
                  ethers.utils.formatUnits(txOptions.maxPriorityFeePerGas, "gwei")
                );
            } else if (feeData.gasPrice) { 
                txOptions = {
                    gasPrice: feeData.gasPrice.mul(120).div(100), // 현재 가스 가격의 120%
                };
                console.log("[GasOptions] Using Legacy Tx Options (gasPrice Gwei):", ethers.utils.formatUnits(txOptions.gasPrice, "gwei"));
            } else {
                console.warn("[GasOptions] Could not determine optimal gas settings from feeData. Using defaults or wallet estimates.");
            }
        } catch (gasError) {
            console.error("Error fetching fee data, using default gas settings:", gasError);
        }
    }
    if (estimatedGasLimit) {
        txOptions.gasLimit = estimatedGasLimit.mul(120).div(100); // 추정 가스량에 20% 여유분
        console.log(`[GasOptions] Using gasLimit: ${txOptions.gasLimit.toString()}`);
    }
    return txOptions;
  }
  
  
  async function claimFreeSpins() {
    if (typeof showLoading !== 'function' || typeof hideLoading !== 'function') {
        console.error("showLoading or hideLoading function is not available."); return;
    }
    if (globalIsLoading) return;
  
    if (typeof window.checkMetamaskAccountConsistency === 'function' && !(await window.checkMetamaskAccountConsistency())) return;
  
    const now = Date.now();
    if (isClaimFree || (now - lastFree < 1000)) {
        console.log("Claim free spins throttled"); return;
    }
    isClaimFree = true; lastFree = now;
    showLoading("Requesting free spins...");
  
    try {
        const slotContract = await getSlot();
        let estimatedGasLimit;
        try {
            estimatedGasLimit = await slotContract.estimateGas.claimFreeSpins();
        } catch (e) { console.warn("Could not estimate gas for claimFreeSpins", e); }
  
        const txOptions = await getDynamicGasOptions(estimatedGasLimit);
        showLoading("Waiting for transaction signature... (Free Spins)");
        const tx = await safeSend(() => slotContract.claimFreeSpins(txOptions));
        showLoading(`Processing free spins transaction... TX: ${tx.hash.slice(0, 10)}`);
        const rc = await waitRc(tx.hash);
        if (!rc || rc.status !== 1) throw Error(`Transaction failed. Status: ${rc?.status || 'unknown'}`);
  
        showLoading("Processing seed information...");
        const seeds = await parseSeeds(rc);
  
        if (!playerSession) throw new Error("playerSession is not defined");
        playerSession.wallet = walletAddress;
        
        const newSeedObjects = seeds.map(v => ({ value: v, used: false, score: 0 }));
        playerSession.seeds = (playerSession.seeds?.filter(s => s.used) || []).concat(newSeedObjects);
  
        if (typeof saveSession === 'function') saveSession();
  
        playCredits = (playerSession.seeds?.filter(s => !s.used).length || 0) +
                      (playerSession.paidSeeds?.filter(s => !s.used).length || 0);
  
        alert("🎰 Free spins claimed! You've got " + seeds.length + " new spins.");
  
        if (playCredits > 0 && (playerSession.seeds.some(s=>!s.used) || playerSession.paidSeeds.some(s=>!s.used))) {
            gameStarted = true;
        }
    } catch (e) {
        let errMsg = "Failed to claim free spins: ";
        if (e.reason) errMsg += e.reason;
        else if (e.data?.message) errMsg += e.data.message;
        else if (e.error?.message) errMsg += e.error.message;
        else if (e.message) errMsg += e.message;
        else errMsg += "Unknown error.";
        alert(errMsg);
        console.error("claimFreeSpins error:", e);
    } finally {
        isClaimFree = false;
        hideLoading();
    }
  }
  
  async function buyPlays(count, eth) {
    if (typeof showLoading !== 'function' || typeof hideLoading !== 'function') return;
    if (globalIsLoading) return;
  
    if (typeof window.checkMetamaskAccountConsistency === 'function' && !(await window.checkMetamaskAccountConsistency())) return;
    const now = Date.now();
    if (isBuying || (now - lastBuy < 1000)) {
        console.log("Buy plays throttled"); return;
    }
    isBuying = true; lastBuy = now;
    showLoading(`Purchasing ${count} plays...`);
  
    try {
        const slotContract = await getSlot();
        let estimatedGasLimit;
        try {
            estimatedGasLimit = await slotContract.estimateGas.buyPlays(count, { value: ethers.utils.parseEther(eth) });
        } catch (e) { console.warn("Could not estimate gas for buyPlays", e); }
  
        const txOptions = await getDynamicGasOptions(estimatedGasLimit);
        
        showLoading("Waiting for transaction signature... (Buy Plays)");
        const finalTxOptions = { ...txOptions, value: ethers.utils.parseEther(eth) };
        const tx = await safeSend(() => slotContract.buyPlays(count, finalTxOptions));
        showLoading(`Processing purchase transaction... TX: ${tx.hash.slice(0, 10)}`);
        const rc = await waitRc(tx.hash);
        if (!rc || rc.status !== 1) throw Error(`Transaction failed. Status: ${rc?.status || 'unknown'}`);
  
        showLoading("Processing seed information...");
        const seeds = await parseSeeds(rc);
        if (!playerSession) throw new Error("playerSession is not defined");
  
        playerSession.paidSeeds = playerSession.paidSeeds || [];
        playerSession.paidSeeds.push(...seeds.map(v => ({ value: v, used: false, score: 0 })));
  
        if (typeof saveSession === 'function') saveSession();
  
        playCredits = (playerSession.seeds?.filter(s => !s.used).length || 0) +
                      (playerSession.paidSeeds?.filter(s => !s.used).length || 0);
  
        alert("💰 Plays purchased! You've got " + seeds.length + " new spins.");
        if (playCredits > 0 && (playerSession.seeds.some(s=>!s.used) || playerSession.paidSeeds.some(s=>!s.used))) {
            gameStarted = true;
        }
    } catch (e) {
        let errMsg = "Failed to purchase plays: ";
        if (e.reason) errMsg += e.reason;
        else if (e.data?.message) errMsg += e.data.message;
        else if (e.error?.message) errMsg += e.error.message;
        else if (e.message) errMsg += e.message;
        else errMsg += "Unknown error.";
        alert(errMsg);
        console.error("buyPlays error:", e);
    } finally {
        isBuying = false;
        hideLoading();
    }
  }
  
  async function claimTokens() {
    if (typeof showLoading !== 'function' || typeof hideLoading !== 'function') return;
    if (globalIsLoading) return;
  
    if (typeof window.checkMetamaskAccountConsistency === 'function' && !(await window.checkMetamaskAccountConsistency())) return;
    const now = Date.now();
    if (isClaimToken || (now - lastToken < 1000)) {
        console.log("Claim tokens throttled"); return;
    }
    isClaimToken = true; lastToken = now;
    showLoading("Preparing to claim tokens...");
  
    const allSeedsInSession = [...(playerSession?.seeds || []), ...(playerSession?.paidSeeds || [])];
    const lastUsedSeedObject = [...allSeedsInSession].reverse().find(s => s.used);
  
    if (!lastUsedSeedObject || !lastUsedSeedObject.value) {
        alert("No used seeds found to claim. Please play the game first.");
        isClaimToken = false;
        hideLoading();
        return;
    }
    const seedValueForContract = ethers.BigNumber.from(lastUsedSeedObject.value);
  
    try {
        if (score === 0) {
            alert("No score to claim (UI score is 0).");
            isClaimToken = false;
            hideLoading();
            return;
        }
        const slotContract = await getSlot();
  
        showLoading("Verifying claim eligibility...");
        let estimatedGasLimit;
        try {
            if (walletAddress && ethers.utils.isAddress(walletAddress)) {
                const viewResult = await slotContract.getCalculatedTotalScoreForClaim(walletAddress, seedValueForContract);
                console.log("[ClaimTokens] DEBUG: Score from view:", viewResult.calculatedScore.toString(), "Seeds:", viewResult.seedsConsideredCount.toString());
                if (viewResult.calculatedScore.isZero() && score > 0) {
                    console.warn("[ClaimTokens] DEBUG: Contract view 0, UI score > 0.");
                }
            }
            estimatedGasLimit = await slotContract.estimateGas.claimTokensBySeed(seedValueForContract);
            console.log(`[ClaimTokens] Estimated gas limit: ${estimatedGasLimit.toString()}`);
        } catch (viewOrEstimateError) { 
            console.warn("[ClaimTokens] DEBUG: Error calling view fn or estimating gas:", viewOrEstimateError);
        }
        
        await slotContract.callStatic.claimTokensBySeed(seedValueForContract); 
        
        const txOptions = await getDynamicGasOptions(estimatedGasLimit);
        showLoading("Waiting for transaction signature... (Claim Tokens)");
        const tx = await safeSend(() => slotContract.claimTokensBySeed(seedValueForContract, txOptions));
        showLoading(`Processing token claim... TX: ${tx.hash.slice(0, 10)}`);
        const rc = await waitRc(tx.hash);
        if (!rc || rc.status !== 1) throw Error(`Transaction failed. Status: ${rc?.status || 'unknown'}`);
  
        const claimedScoreEstimate = score;
        // 알림 메시지에서 토큰 이름 변경
        alert(`✅ ${claimedScoreEstimate} $tMBV claimed! (TX: ${tx.hash.slice(0, 10)}...)`); 
  
        playerSession = { wallet: walletAddress, seeds: [], paidSeeds: [], totalScore: 0 };
        score = 0;
        playCredits = 0;
        if (typeof saveSession === 'function') saveSession();
        gameStarted = false;
  
        showLoading("Updating balance information...");
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2초 딜레이
  
        if (typeof fetchAndUpdateTokenInfo === 'function') {
            await fetchAndUpdateTokenInfo(); // 내부적으로 tMBV 정보 업데이트
        }
        
        if (typeof restoreDefaultLayout === 'function') {
            restoreDefaultLayout();
        } else {
            hideLoading(); 
        }
  
    } catch (e) {
        let errorMessage = "Token claim failed: ";
        if (e.reason) errorMessage += e.reason;
        else if (e.error?.message) errorMessage += e.error.message;
        else if (e.data?.message) errorMessage += e.data.message;
        else if (e.message) errorMessage += e.message;
        else errorMessage += "Unknown error.";
        alert(errorMessage);
        console.error("[claimTokens] Error:", e);
    } finally {
        isClaimToken = false;
        if (typeof hideLoading === 'function' && globalIsLoading) {
            hideLoading();
        }
    }
  }