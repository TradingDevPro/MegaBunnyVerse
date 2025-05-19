// wallet.js – Phantom 지갑 감지, 네트워크 전환, Ethers v5 문법 일관성, MegaETH 설정

// 전역 변수 (main.js와 공유될 수 있음)
// provider, signer, walletAddress, isConnected, isAdmin 등은 main.js 또는 여기서 선언하고 관리합니다.

let expectedChainId = null; // deploy.json에서 읽어온 숫자 형태의 체인 ID (MegaETH용)
let adminChecked = false;

let adminToolComponents = {}; 
let adminToolButtons = [];    

// tMONG 대신 tMBV 관련 메타데이터 캐시용 변수 (이름은 tMONG 유지, 내용은 tMBV)
let tMONGDecimals = null; 
let tMONGSymbol = null; // 실제로는 $tMBV 심볼 저장

const TMBV_MINIMAL_ABI = [ // ABI 이름 변경은 선택적이나, 명확성을 위해 변경 가능
    "function balanceOf(address owner) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

async function loadDeployInfo() {
    // window.__TMONG_ADDR__ 대신 window.__TMBV_ADDR__ 또는 일반화된 이름 사용
    if (expectedChainId !== null && typeof window.__TOKEN_ADDR__ !== 'undefined' && typeof window.__SLOT_ADDR__ !== 'undefined') {
        return true;
    }
    try {
        const response = await fetch("./deploy.json");
        if (!response.ok) throw new Error("Failed to fetch deploy.json. Status: " + response.status);
        const info = await response.json();
        
        // deploy.json에서 tMegaBunnyVerse 필드 확인 (deploy.js에서 설정한 키와 일치해야 함)
        if (!info.chainId || !info.SlotMachine || !info.tMegaBunnyVerse) { // 키 이름 변경
             throw new Error("deploy.json is missing key data (chainId, SlotMachine, tMegaBunnyVerse).");
        }
        expectedChainId = Number(info.chainId); // MegaETH chainId가 여기에 설정됨
        window.__SLOT_ADDR__ = info.SlotMachine;
        window.__TOKEN_ADDR__ = info.tMegaBunnyVerse; // 새 토큰 주소를 window 객체에 저장
        
        console.log(`[DeployInfo] Loaded successfully for ${info.network}. Expected Chain ID:`, expectedChainId, "Token Address:", window.__TOKEN_ADDR__);
        return true;
    } catch (e) {
        console.error("❌ deploy.json load failed:", e);
        expectedChainId = null;
        window.__SLOT_ADDR__ = undefined;
        window.__TOKEN_ADDR__ = undefined; // 변수명 일관성
        return false; 
    }
}

// 네트워크 전환 요청 함수
async function switchToCorrectNetwork() {
    const detectedWalletProvider = detectEthereumProvider(); 
    if (!detectedWalletProvider) throw new Error("No Ethereum compatible wallet (like MetaMask or Phantom) is installed.");

    if (expectedChainId === null) {
        await loadDeployInfo(); // 여기서 MegaETH chainId 로드 시도
        if (expectedChainId === null) throw new Error("Expected Chain ID not configured. Cannot switch network.");
    }

    const targetChainIdHex = '0x' + expectedChainId.toString(16);

    try {
        await detectedWalletProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetChainIdHex }],
        });
        console.log(`Successfully switched to chain ID: ${targetChainIdHex} (${expectedChainId})`);
        provider = new ethers.providers.Web3Provider(detectedWalletProvider, "any");
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();
        return true;
    } catch (switchError) {
        if (switchError.code === 4902) { 
            console.log(`Chain ID ${targetChainIdHex} not found in wallet. User may need to add it manually.`);
            // MegaETH 네트워크 정보 (RPC URL, Chain Name 등)를 하드코딩하거나 deploy.json에서 읽어와서 추가 시도 가능
            // 예시: (실제 MegaETH 정보로 대체 필요)
            const networkDetails = { 
                chainId: targetChainIdHex, 
                chainName: 'MegaETH Testnet', // 실제 네트워크 이름으로 변경
                rpcUrls: [process.env.MEGAETH_RPC_URL || 'YOUR_MEGAETH_RPC_URL'], // 실제 RPC URL로 변경
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, // MegaETH 네이티브 통화 정보
                // blockExplorerUrls: ['YOUR_MEGAETH_EXPLORER_URL'] // 선택적
            };
            try {
                await detectedWalletProvider.request({ method: 'wallet_addEthereumChain', params: [networkDetails] });
                await detectedWalletProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: targetChainIdHex }] });
                provider = new ethers.providers.Web3Provider(detectedWalletProvider, "any");
                signer = provider.getSigner();
                walletAddress = await signer.getAddress();
                return true;
            } catch (addError) {
                console.error("Failed to add or switch to the MegaETH chain:", addError);
                alert(`Failed to add network ${expectedChainId} (MegaETH). Please add it manually using RPC: ${networkDetails.rpcUrls[0]}`);
                return false;
            }
        } else {
            console.error("Failed to switch network:", switchError);
            alert(`Failed to switch network. Please switch to Chain ID ${expectedChainId} (MegaETH) in your wallet manually. Error: ${switchError.message || switchError}`);
        }
        return false;
    }
}

async function ensureCorrectNetwork() {
    if (!provider) { 
        console.warn("Provider not available to check network. Connect wallet first.");
        alert("Wallet not connected. Please connect your wallet first.");
        return false;
    }
    if (expectedChainId === null) {
        if (!await loadDeployInfo() || expectedChainId === null) { 
            alert("DApp configuration error: Expected network ID for MegaETH is not set.");
            return false;
        }
    }

    const currentNetwork = await provider.getNetwork();
    if (currentNetwork.chainId !== expectedChainId) {
        if (typeof showLoading === 'function') showLoading(`Incorrect network. Requesting switch to MegaETH (Chain ID ${expectedChainId})...`);
        const switched = await switchToCorrectNetwork(); 
        if (typeof hideLoading === 'function') hideLoading();
        
        if (!switched) {
            alert(`Please switch to the correct network (MegaETH - Chain ID: ${expectedChainId}) to proceed.`);
            return false;
        }
        console.log("Network switched. It's recommended to re-verify or re-initiate connection if DApp state is inconsistent.");
        return true; 
    }
    return true; 
}


async function cacheTMONGMetadata() { // 함수명은 TMONG 유지, 내용은 tMBV
    if (!provider || !window.__TOKEN_ADDR__) { // __TOKEN_ADDR__ 사용
        console.warn("[TokenMetadata] Provider or Token address not available for caching.");
        return false;
    }
    if (tMONGDecimals !== null && tMONGSymbol !== null) { // 이미 캐시됨 (tMBV 정보)
        console.log("[TokenMetadata] Already cached.");
        return true;
    }
    try {
        console.log("[TokenMetadata] Fetching and caching decimals and symbol for $tMBV...");
        const tokenContract = new ethers.Contract(window.__TOKEN_ADDR__, TMBV_MINIMAL_ABI, provider);
        const [decimalsResult, symbolResult] = await Promise.all([
            tokenContract.decimals(),
            tokenContract.symbol() // $tMBV 심볼 반환 기대
        ]);
        tMONGDecimals = Number(decimalsResult);
        tMONGSymbol = symbolResult; // tMONGSymbol 변수에 $tMBV 심볼 저장
        console.log(`[TokenMetadata] Cached: Decimals=${tMONGDecimals}, Symbol=${tMONGSymbol} (for tMBV)`);
        return true;
    } catch (error) {
        console.error("Error caching tMBV metadata:", error);
        tMONGDecimals = null; tMONGSymbol = null;
        return false;
    }
}

async function getTMongBalance(userAddress) { // 함수명은 TMONG 유지, 내용은 tMBV
    if (!provider || !window.__TOKEN_ADDR__ || !userAddress || !ethers.utils.isAddress(userAddress)) {
        console.warn("[Balance] Prerequisites not met for tMBV balance fetch.");
        return "N/A";
    }
    if (tMONGDecimals === null || tMONGSymbol === null) { // tMBV 메타데이터 캐시 확인
        await cacheTMONGMetadata(); // 내부적으로 tMBV 메타데이터 캐시
    }
    // 캐시된 tMBV 정보 사용, 없으면 기본값 사용 후 다시 시도
    const currentDecimals = tMONGDecimals !== null ? tMONGDecimals : 18; 
    const currentSymbol = tMONGSymbol !== null ? tMONGSymbol : "$tMBV"; // 기본 심볼도 $tMBV로

    try {
        const tokenContract = new ethers.Contract(window.__TOKEN_ADDR__, TMBV_MINIMAL_ABI, provider);
        const balanceBigNumber = await tokenContract.balanceOf(userAddress);
        
        let finalDecimals = currentDecimals;
        let finalSymbol = currentSymbol;
        // Fallback if cache was initially null
        if (tMONGDecimals === null && typeof tokenContract.decimals === 'function') {
            try { finalDecimals = Number(await tokenContract.decimals()); tMONGDecimals = finalDecimals; }
            catch(e) { console.warn("Failed to fetch decimals on fallback for tMBV."); }
        }
        if (tMONGSymbol === null && typeof tokenContract.symbol === 'function') {
            try { finalSymbol = await tokenContract.symbol(); tMONGSymbol = finalSymbol; } // tMBV 심볼 가져오기
            catch(e) { console.warn("Failed to fetch symbol on fallback for tMBV."); }
        }
        const formattedBalance = ethers.utils.formatUnits(balanceBigNumber, finalDecimals);
        return `${formattedBalance} ${finalSymbol}`; // $tMBV 심볼과 함께 반환
    } catch (error) {
        console.error("Error fetching tMBV balance:", error);
        if (error.code === -32603 || error.message?.includes("429")) {
            return "Balance update delayed (RPC limit).";
        }
        return "Error fetching balance";
    }
}

// 함수명은 addTMongToMetamask로 유지, 실제로는 tMBV 토큰 추가
async function addTMongToMetamask() { 
    const detectedWalletProvider = detectEthereumProvider();
    if (!detectedWalletProvider) return alert("No Ethereum compatible wallet detected.");
    if (!window.__TOKEN_ADDR__) return alert("tMBV token contract address unknown. Please check deploy.json."); // 메시지 변경

    showLoading("Adding $tMBV to your wallet..."); // 메시지 변경
    let tokenSymbol = tMONGSymbol || '$tMBV'; // 기본 심볼 tMBV
    let tokenDecimals = tMONGDecimals !== null ? tMONGDecimals : 18;

    try {
        if (provider && (tMONGSymbol === null || tMONGDecimals === null)) { // tMBV 정보 가져오기
            const tokenContractForInfo = new ethers.Contract(window.__TOKEN_ADDR__, TMBV_MINIMAL_ABI, provider);
            if (tMONGSymbol === null) tokenSymbol = await tokenContractForInfo.symbol(); // tMBV 심볼
            if (MONGDecimals === null) tokenDecimals = Number(await tokenContractForInfo.decimals());
            if (tMONGSymbol === null && tokenSymbol) tMONGSymbol = tokenSymbol; // 캐시에 저장
            if (tMONGDecimals === null && tokenDecimals) tMONGDecimals = tokenDecimals; // 캐시에 저장
        } else if (!provider) {
            console.warn("addTMongToMetamask: Wallet provider not available for tMBV metadata fetch.");
        }

        await detectedWalletProvider.request({
            method: 'wallet_watchAsset',
            // options 에 새 토큰 주소, 심볼($tMBV) 사용
            params: { type: 'ERC20', options: { address: window.__TOKEN_ADDR__, symbol: tokenSymbol, decimals: tokenDecimals }}, 
        });
        alert(`${tokenSymbol} token added (or attempt was made). Please check your wallet.`); // 메시지 변경
    } catch (e) {
        alert(`Error adding ${tokenSymbol} token: ${e.message}`); console.error(e);
    } finally { hideLoading(); }
}
window.addTMongToMetamask = addTMongToMetamask; // 함수 이름은 유지

async function getSlotMachineContractBalance() {
    if (!provider || !window.__SLOT_ADDR__) return null;
    try {
        return ethers.utils.formatEther(await provider.getBalance(window.__SLOT_ADDR__));
    } catch (e) { console.error("Error fetching contract balance:", e); return null; }
}

async function getCurrentMetamaskAddress() {
    const detectedWalletProvider = detectEthereumProvider();
    if (!detectedWalletProvider) return null;
    try {
        const accounts = await detectedWalletProvider.request({ method: 'eth_accounts' });
        return accounts?.[0] ? ethers.utils.getAddress(accounts[0]) : null;
    } catch (e) { console.error("Error getCurrentMetamaskAddress:", e); return null; }
}

function disconnectAndReset(reason = "Session ended. Please log in again.") {
    console.log(`[Disconnect] Reason: ${reason}`);
    
    const oldWalletForStorage = playerSession?.wallet;

    walletAddress = ""; provider = null; signer = null;
    isConnected = false; isAdmin = false; adminChecked = false;
    if (connectButton) connectButton.html("🦊 Connect Wallet");
    if (walletDisplay) walletDisplay.html("");

    Object.values(adminToolComponents).forEach(comp => { if (comp?.remove) comp.remove(); });
    adminToolComponents = {};
    adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
    adminToolButtons = [];

    if (playerSession?.wallet) localStorage.removeItem(`slot_session_${playerSession.wallet}`);
    playerSession = { wallet: "", seeds: [], paidSeeds: [], totalScore: 0 };

    gameStarted = false; score = 0; playCredits = 0; result = ''; spinning = false;
    if (typeof reels !== 'undefined') reels.length = 0;
    if (typeof scoreBreakdown !== 'undefined') scoreBreakdown.length = 0;

    if (typeof hideTokenInfoUI === 'function') hideTokenInfoUI();

    const activeProvider = detectEthereumProvider();
    if (activeProvider && activeProvider.removeListener) {
        activeProvider.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
        activeProvider.removeListener('chainChanged', handleMetaMaskChainChanged);
    }
    
    if (typeof globalIsLoading !== 'undefined' && globalIsLoading && typeof hideLoading === 'function') {
        hideLoading();
    }
    if (typeof restoreDefaultLayout === 'function') {
        restoreDefaultLayout(); 
    }
    
    setTimeout(() => { if (reason) alert(reason); }, 50);
    console.log("-------------------[DISCONNECT END]------------------");
}

function handleMetaMaskChainChanged(chainId) { 
    const newChainId = Number(chainId); 
    console.log(`[WalletJS] MetaMask network changed to Chain ID: ${newChainId}. Verifying...`);

    if (typeof showLoading === 'function') {
        if (typeof globalIsLoading === 'undefined' || !globalIsLoading) {
            showLoading("Network change detected. Verifying...");
        } else {
            showLoading("Network change detected. Verifying..."); 
        }
    }

    if (expectedChainId === null) { 
        console.warn("[WalletJS-ChainChange] expectedChainId (for MegaETH) is null. Cannot verify network yet.");
        if (typeof hideLoading === 'function') hideLoading();
        return;
    }

    if (newChainId !== expectedChainId) {
        console.warn(`[WalletJS-ChainChange] Incorrect network. Expected MegaETH: ${expectedChainId}, Got: ${newChainId}`);
        disconnectAndReset(`Network changed. Please connect to the correct network (MegaETH - Chain ID: ${expectedChainId}). Wallet disconnected.`);
    } else if (isConnected) { 
        console.log("[WalletJS-ChainChange] Network is correct (MegaETH). Current session maintained.");
        if (typeof hideLoading === 'function') hideLoading();
    } else {
        console.log("[WalletJS-ChainChange] Network is correct (MegaETH), but wallet not connected. User can now connect.");
        if (typeof hideLoading === 'function') hideLoading();
    }
}

async function checkMetamaskAccountConsistency() {
    if (!isConnected || !playerSession?.wallet) return true;
    const currentMetaMaskAddr = await getCurrentMetamaskAddress();
    if (currentMetaMaskAddr && playerSession.wallet && currentMetaMaskAddr.toLowerCase() !== ethers.utils.getAddress(playerSession.wallet).toLowerCase()) {
        disconnectAndReset("MetaMask active account differs from the DApp's logged-in account. Logged out for security.");
        return false;
    }
    return true;
}
window.checkMetamaskAccountConsistency = checkMetamaskAccountConsistency;

async function handleMetaMaskAccountsChanged(accounts) {
    console.log("---[DApp ACCOUNTS CHANGED START]---");
    if (typeof showLoading === 'function' && (typeof globalIsLoading === 'undefined' || !globalIsLoading)) {
        showLoading("Account change detected. Verifying session...");
    } else if (typeof showLoading === 'function') {
        showLoading("Account change detected. Verifying session...");
    }

    const newActiveAddr = accounts?.[0] ? ethers.utils.getAddress(accounts[0]) : null;
    const loggedInWallet = walletAddress;
    const loggedInAddr = loggedInWallet ? ethers.utils.getAddress(loggedInWallet) : null;

    console.log(`[DApp Accounts Changed] Current DApp session address: ${loggedInAddr}, New MetaMask active address: ${newActiveAddr}`);

    if (!isConnected || !loggedInAddr) { 
        if (typeof hideLoading === 'function') hideLoading();
        console.log("[DApp Accounts Changed] DApp not connected or no initial session.");
        return; 
    }

    if (!newActiveAddr) {
        console.log("[DApp Accounts Changed] MetaMask accounts disconnected or locked.");
        disconnectAndReset("MetaMask account connection lost or locked.");
    } else if (newActiveAddr.toLowerCase() !== loggedInAddr.toLowerCase()) {
        console.log("[DApp Accounts Changed] MetaMask active account differs. Resetting session.");
        disconnectAndReset(`Account changed. Logged out. Please reconnect with ${newActiveAddr.slice(0, 6)}...`);
    } else {
        console.log("[DApp Accounts Changed] Account same. Session maintained.");
        if (typeof hideLoading === 'function') hideLoading();
    }
    console.log("---[DApp ACCOUNTS CHANGED END]---");
}

function detectEthereumProvider() {
    let providerToUse = null;
    if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
        providerToUse = window.ethereum.providers.find(p => p.isPhantom); 
        if (providerToUse) {
            console.log("Phantom provider found in window.ethereum.providers (EIP-6963).");
            return providerToUse;
        }
        providerToUse = window.ethereum.providers.find(p => p.isMetaMask);
        if (providerToUse) {
            console.log("MetaMask provider found in window.ethereum.providers (EIP-6963).");
            return providerToUse;
        }
        if(window.ethereum.providers.length > 0){
            console.log("Using the first provider from window.ethereum.providers (EIP-6963).");
            return window.ethereum.providers[0];
        }
    }

    if (window.ethereum) {
        if (window.ethereum.isPhantom) {
            console.log("Phantom provider detected (window.ethereum.isPhantom).");
            return window.ethereum;
        }
        if (window.ethereum.isMetaMask) {
            console.log("MetaMask provider detected (window.ethereum.isMetaMask).");
            return window.ethereum;
        }
        console.log("Generic EIP-1193 provider (window.ethereum) detected.");
        return window.ethereum;
    }
    
    if (window.phantom?.ethereum) {
        console.log("Dedicated Phantom Ethereum provider (window.phantom.ethereum) detected.");
        return window.phantom.ethereum;
    }
    
    console.log("No Ethereum provider (MetaMask, Phantom, etc.) detected.");
    return null;
}


async function connectWallet() {
    console.log("---[CONNECT WALLET START]---");
    showLoading("Connecting wallet...");

    try {
        if (!await loadDeployInfo()){ // 여기서 MegaETH용 deploy.json 로드
            hideLoading(); 
            throw new Error("Failed to load DApp configuration for MegaETH. Please refresh.");
        }
        if (isConnected) { disconnectAndReset("User disconnected."); return; }

        showLoading("Detecting and connecting to wallet...");
        const detectedWalletProvider = detectEthereumProvider();
        if (!detectedWalletProvider) { 
            throw new Error("🦊 No Ethereum wallet (like MetaMask or Phantom) detected. Please install one and refresh."); 
        }
        
        provider = new ethers.providers.Web3Provider(detectedWalletProvider, "any"); 
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        walletAddress = await signer.getAddress();

        showLoading("Verifying network (MegaETH)..."); // 메시지 변경
        const net = await provider.getNetwork();
        if (net.chainId !== expectedChainId) { // expectedChainId는 MegaETH의 chainId
            const switched = await switchToCorrectNetwork(); 
            if (!switched) {
                throw new Error(`Please switch to the correct network (MegaETH - Chain ID: ${expectedChainId}) to continue.`);
            }
            const newNet = await provider.getNetwork();
            if (newNet.chainId !== expectedChainId) {
                throw new Error(`Network switch to MegaETH failed or was not completed. Still on Chain ID ${newNet.chainId}.`);
            }
        }
        
        showLoading("Requesting signature...");
        await signer.signMessage("Sign to use Monad SlotMachine and verify ownership."); // 메시지는 일단 유지

        isConnected = true;
        if (walletDisplay) walletDisplay.html(`${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`);
        if (connectButton) connectButton.html("🔓 Disconnect");

        if (detectedWalletProvider.removeListener) { 
            detectedWalletProvider.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
            detectedWalletProvider.removeListener('chainChanged', handleMetaMaskChainChanged);
        }
        if (detectedWalletProvider.on) { 
            detectedWalletProvider.on('accountsChanged', handleMetaMaskAccountsChanged);
            detectedWalletProvider.on('chainChanged', handleMetaMaskChainChanged);
        }

        showLoading("Synchronizing player data...");
        adminChecked = false; 
        await cacheTMONGMetadata(); // tMBV 메타데이터 캐시

        const slotContractInstance = (typeof getSlot === 'function') ? await getSlot() : null;
        const results = await Promise.allSettled([
            getTMongBalance(walletAddress), // tMBV 잔액 조회
            slotContractInstance?.getUnclaimedUserSeeds(walletAddress),
            (async () => {
                if (window.__SLOT_ADDR__ && provider && slotContractInstance) {
                    try {
                        const owner = await slotContractInstance.owner();
                        adminChecked = true;
                        return (owner.toLowerCase() === walletAddress.toLowerCase());
                    } catch (e) { console.warn("Admin check (owner) failed:", e); adminChecked = true; return false; }
                }
                adminChecked = true; return false;
            })()
        ]);

        const tmbvBalanceStr = results[0].status === 'fulfilled' ? results[0].value : "N/A"; // 변수명 변경
        const unclaimedData = results[1].status === 'fulfilled' ? results[1].value : null;
        isAdmin = results[2].status === 'fulfilled' ? results[2].value : false;

        // updateTokenInfoUI 호출 시 window.__TOKEN_ADDR__ 사용
        if (typeof updateTokenInfoUI === 'function') updateTokenInfoUI(tmbvBalanceStr, window.__TOKEN_ADDR__);

        let contractUnclaimedSeedValues = [];
        if (unclaimedData && ethers.utils.getAddress(unclaimedData[0]).toLowerCase() === walletAddress.toLowerCase()) {
            contractUnclaimedSeedValues = unclaimedData[1].map(s => s.toString());
        }

        const loadedLocalSession = loadSession(walletAddress);
        let newPlayerSession = { wallet: walletAddress, totalScore: loadedLocalSession.totalScore || 0, seeds: [], paidSeeds: [] };
        const allSeedsMap = new Map();
        [...(loadedLocalSession.seeds || []), ...(loadedLocalSession.paidSeeds || [])].forEach(s => allSeedsMap.set(s.value, { ...s }));
        contractUnclaimedSeedValues.forEach(v => { if (!allSeedsMap.has(v)) allSeedsMap.set(v, { value: v, used: false, score: 0, originalType: 'free' }); });
        
        allSeedsMap.forEach(s => {
            if (s.originalType === 'paid') newPlayerSession.paidSeeds.push(s); else newPlayerSession.seeds.push(s);
        });
        newPlayerSession.seeds = Array.from(new Map(newPlayerSession.seeds.map(s => [s.value, s])).values());
        newPlayerSession.paidSeeds = Array.from(new Map(newPlayerSession.paidSeeds.map(s => [s.value, s])).values());
        playerSession = newPlayerSession;

        if (typeof saveSession === 'function') saveSession();

        score = playerSession.totalScore || 0;
        if (typeof hasRemainingSeeds === 'function' && hasRemainingSeeds()) {
            playCredits = (playerSession.seeds?.filter(s => !s.used).length || 0) + (playerSession.paidSeeds?.filter(s => !s.used).length || 0);
            gameStarted = true;
            if (typeof reels !== 'undefined' && reels.length === 0 && typeof createReel === 'function') {
                for (let i = 0; i < 3; i++) reels.push(createReel());
            }
        } else {
            playCredits = 0; gameStarted = false;
        }

        if (isAdmin && typeof setupDevTools === 'function') {
            if(typeof hideLoading === 'function') hideLoading(); 
            await setupDevTools(); 
        } else {
            if (typeof hideLoading === 'function') {
                hideLoading();
            }
        }
        
        console.log(`[ConnectWallet] Done. Credits: ${playCredits}, Admin: ${isAdmin}, Game Started: ${gameStarted}`);
        console.log("---[CONNECT WALLET END]---");

    } catch (e) {
        alert("❌ Wallet Connection Error: " + (e.message || "Unknown error. Check console."));
        console.error("Wallet connection error:", e);
        isConnected = false; 
        if (connectButton) connectButton.html("🦊 Connect Wallet");
        if (walletDisplay) walletDisplay.html("");
        Object.values(adminToolComponents).forEach(comp => { if (comp?.remove) comp.remove(); }); adminToolComponents = {};
        adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); }); adminToolButtons = [];
        if (typeof hideTokenInfoUI === 'function') hideTokenInfoUI();
        
        const activeProviderOnError = detectEthereumProvider();
        if (activeProviderOnError && activeProviderOnError.removeListener) {
            activeProviderOnError.removeListener('accountsChanged', handleMetaMaskAccountsChanged);
            activeProviderOnError.removeListener('chainChanged', handleMetaMaskChainChanged);
        }
        if(typeof hideLoading === 'function') hideLoading();
        console.log("---[CONNECT WALLET ERROR END]---");
    }
}

async function setupDevTools() {
    if (!isAdmin) {
        adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
        adminToolButtons = [];
        return;
    }
    showLoading("Setting up Admin Tools...");
    
    adminToolButtons.forEach(btn => { if (btn?.remove) btn.remove(); });
    adminToolButtons = [];
    
    let currentX = 20; 
    let walletDisplayWidth = 0; 
    if (walletDisplay && walletDisplay.elt) {
        try { 
            walletDisplayWidth = walletDisplay.elt.offsetWidth > 0 ? walletDisplay.elt.offsetWidth : 100; 
        } catch(e){
            console.warn("Could not get walletDisplay offsetWidth, using default for admin button positioning.");
            walletDisplayWidth = 100; 
        }
    } else {
        walletDisplayWidth = 100; 
    }

    if (connectButton && connectButton.elt) {
        currentX = connectButton.x + connectButton.width;
        if (walletDisplay && walletDisplay.elt) {
             currentX += walletDisplayWidth + 10; 
        } else {
            currentX += 10; 
        }
    }
    
    currentX -= 150; 

    let currentY = connectButton ? connectButton.y : 20; 
    const buttonHeight = 25;
    const spacing = 8;
    
    let contractBalanceEth = null;
    try { contractBalanceEth = await getSlotMachineContractBalance(); } catch(e) { console.error(e); }
    // MON 대신 ETH 또는 MegaETH의 네이티브 토큰으로 변경 필요
    let withdrawAllLabel = `💸 Withdraw All ${contractBalanceEth ? `(${parseFloat(contractBalanceEth).toFixed(2)} ETH)` : ''}`; 
    
    const adminActions = [
        { label: "🧹 Clear Session", width: 140, action: () => { if (globalIsLoading) return; showLoading("Clearing session..."); localStorage.removeItem(`slot_session_${walletAddress}`); alert("Session cleared. Reloading..."); location.reload(); }},
        { label: withdrawAllLabel, width: 180, action: async () => { if (globalIsLoading) return; if(!signer) return alert("No signer"); showLoading("Withdrawing all..."); try {const c=new ethers.Contract(window.__SLOT_ADDR__,["function withdrawAll()"],signer); const tx=await c.withdrawAll();showLoading(`TX pending: ${tx.hash.slice(0,10)}`);await tx.wait();alert("Withdraw all successful.");if(isAdmin) await setupDevTools();}catch(e){alert("Withdraw all failed: "+ (e.reason || e.data?.message || e.message));}finally{if(!(isAdmin && typeof setupDevTools === 'function' && typeof e === 'undefined')) hideLoading();}}},
        { label: "💸 Withdraw 50%", width: 140, action: async () => { if (globalIsLoading) return; if(!signer) return alert("No signer"); showLoading("Withdrawing 50%..."); try {const c=new ethers.Contract(window.__SLOT_ADDR__,["function withdrawHalf()"],signer); const tx=await c.withdrawHalf();showLoading(`TX pending: ${tx.hash.slice(0,10)}`);await tx.wait();alert("Withdraw 50% successful.");if(isAdmin) await setupDevTools();}catch(e){alert("Withdraw 50% failed: "+ (e.reason || e.data?.message || e.message));}finally{if(!(isAdmin && typeof setupDevTools === 'function' && typeof e === 'undefined')) hideLoading();}}}
    ];

    adminActions.forEach(item => {
        if (currentX + item.width > 780 - 10) { 
            currentX = (connectButton.x + connectButton.width + walletDisplayWidth + 10);
            currentY += buttonHeight + spacing; 
        }
        if (currentX + item.width > 780 -10 && currentX > (connectButton.x + connectButton.width + walletDisplayWidth + 10) ) {
             console.warn("Admin buttons might be too wide for the current layout.");
        }

        const btn = createButton(item.label).position(currentX, currentY).size(item.width, buttonHeight).style("font-size", "10px");
        btn.mousePressed(item.action);
        adminToolButtons.push(btn);
        currentX += item.width + spacing;
    });
    hideLoading();
}