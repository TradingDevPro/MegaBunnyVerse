// admin.js - Logic for the independent Admin Panel
// Ensures DOM is loaded before accessing elements. Uses Ethers v5 syntax.
// Error fix for 'totalAddresses is not defined' and loading indicator management.

// --- 전역 변수 (스크립트 최상단에 선언) ---
let ethersProvider;
let ethersSigner;
let currentAdminAddress;
let isAdminVerified = false;
let slotMachineContractInstance;

let slotMachineAddress;
let slotMachineAbi;
let expectedChainId;

// UI 요소 변수들은 DOMContentLoaded 이후에 할당됩니다.
let connectWalletBtnAdminEl, walletStatusAdminEl, adminAuthStatusEl, adminPanelDivEl,
    playerAddressesTextareaEl, spinsPerPlayerInputAdminEl, grantBatchButtonEl,
    overallProgressDivEl, transactionLogAdminUlEl, loadingOverlayEl, loadingMessageEl;

// --- Configuration Paths ---
const DEPLOY_CONFIG_PATH = './deploy.json';
const ABI_CONFIG_PATH = './SlotMachineABI.json';

// --- DOMContentLoaded 이벤트 리스너 ---
document.addEventListener('DOMContentLoaded', () => {
    connectWalletBtnAdminEl = document.getElementById('connectWalletBtnAdmin');
    walletStatusAdminEl = document.getElementById('walletStatusAdmin');
    adminAuthStatusEl = document.getElementById('adminAuthStatus');
    adminPanelDivEl = document.getElementById('admin-panel');
    playerAddressesTextareaEl = document.getElementById('playerAddressesTextarea');
    spinsPerPlayerInputAdminEl = document.getElementById('spinsPerPlayerInputAdmin');
    grantBatchButtonEl = document.getElementById('grantBatchButton');
    overallProgressDivEl = document.getElementById('overallProgress');
    transactionLogAdminUlEl = document.getElementById('transactionLogAdmin');
    loadingOverlayEl = document.getElementById('loading-overlay');
    loadingMessageEl = document.getElementById('loading-message');

    if (connectWalletBtnAdminEl) {
        connectWalletBtnAdminEl.addEventListener('click', connectAdminWallet);
    } else {
        console.error("Connect wallet button not found in DOM.");
    }
    if (grantBatchButtonEl) {
        grantBatchButtonEl.addEventListener('click', handleGrantBatchSpins);
    } else {
        console.error("Grant batch spins button not found in DOM.");
    }
    initializeAdminPage();
});


// --- Helper Functions ---
function showLoading(message) {
    if (loadingMessageEl && loadingOverlayEl) {
        console.log(`[Admin Loading] Show: ${message}`); // 로그 추가
        loadingMessageEl.textContent = message || "Processing...";
        loadingOverlayEl.style.display = 'flex';
    }
    setAdminInputsDisabled(true);
}

function hideLoading() {
    if (loadingOverlayEl) {
        console.log("[Admin Loading] Hide"); // 로그 추가
        loadingOverlayEl.style.display = 'none';
    }
    setAdminInputsDisabled(false);
}

function setAdminInputsDisabled(isDisabled) {
    if (connectWalletBtnAdminEl) connectWalletBtnAdminEl.disabled = isDisabled;
    // isAdminVerified 상태를 함께 고려하여 실제 버튼 활성화 여부 결정
    const finalDisabledState = isDisabled || !isAdminVerified;
    if (playerAddressesTextareaEl) playerAddressesTextareaEl.disabled = finalDisabledState;
    if (spinsPerPlayerInputAdminEl) spinsPerPlayerInputAdminEl.disabled = finalDisabledState;
    if (grantBatchButtonEl) grantBatchButtonEl.disabled = finalDisabledState;
}

function logToScreen(message, type = 'info') {
    if (transactionLogAdminUlEl) {
        const listItem = document.createElement('li');
        listItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        listItem.className = `log-${type}`;
        transactionLogAdminUlEl.appendChild(listItem);
        transactionLogAdminUlEl.scrollTop = transactionLogAdminUlEl.scrollHeight;
    } else {
        console.log(`LOG (${type}): ${message}`);
    }
}

// --- Initialization ---
async function initializeAdminPage() {
    logToScreen("Admin panel initializing...", "info");
    showLoading("Loading DApp Configuration...");
    try {
        const deployResponse = await fetch(DEPLOY_CONFIG_PATH);
        if (!deployResponse.ok) throw new Error(`Failed to fetch deploy config from ${DEPLOY_CONFIG_PATH}`);
        const deployData = await deployResponse.json();
        slotMachineAddress = deployData.SlotMachine;
        expectedChainId = deployData.chainId;

        const abiResponse = await fetch(ABI_CONFIG_PATH);
        if (!abiResponse.ok) throw new Error(`Failed to fetch ABI from ${ABI_CONFIG_PATH}`);
        const abiData = await abiResponse.json();
        slotMachineAbi = abiData.abi;

        if (!slotMachineAddress || !slotMachineAbi) {
            throw new Error("Contract address or ABI is missing in configuration files.");
        }
        logToScreen("DApp configuration loaded successfully.", "success");
        if (connectWalletBtnAdminEl) connectWalletBtnAdminEl.disabled = false; // 설정 로드 성공 시 연결 버튼 활성화
        hideLoading(); // 설정 로드 완료 후 로딩 해제

    } catch (error) {
        console.error("Initialization Error:", error);
        logToScreen(`Initialization Failed: ${error.message}. Ensure deploy.json and SlotMachineABI.json are accessible.`, "error");
        alert(`Initialization Failed: ${error.message}\nCheck console and ensure configuration files are correct.`);
        if (connectWalletBtnAdminEl) connectWalletBtnAdminEl.disabled = true;
        hideLoading(); // 실패 시에도 로딩 해제
        return; // 초기화 실패 시 더 이상 진행 안 함
    }

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', handleMetaMaskAccountsChanged);
        window.ethereum.on('chainChanged', handleMetaMaskChainChanged);
        
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                logToScreen("Found existing Ethereum connection. Attempting to connect...", "info");
                await connectAdminWallet(); // 여기서 hideLoading은 connectAdminWallet 내부에서 처리
            }
        } catch (e) {
            console.warn("Could not check for existing accounts on load:", e);
        }
    } else {
        logToScreen("MetaMask not detected. Please install MetaMask to use the admin panel.", "error");
        alert("MetaMask not detected. Please install MetaMask.");
        if (connectWalletBtnAdminEl) connectWalletBtnAdminEl.disabled = true;
    }
}

// --- Wallet and Admin Verification ---
async function connectAdminWallet() {
    if (!window.ethers) {
        logToScreen("Ethers.js library is not loaded. Check HTML script tag.", "error");
        alert("Ethers.js library is not loaded. Please check the browser console.");
        return;
    }
    if (!window.ethereum) {
        logToScreen("MetaMask is not installed.", "error");
        alert("MetaMask is not installed. Please install MetaMask and try again.");
        return;
    }
    if (!slotMachineAddress || !slotMachineAbi) {
         logToScreen("DApp configuration (address/ABI) is missing.", "error");
         alert("DApp configuration (address/ABI) is missing. Cannot connect.");
         return;
    }

    showLoading("Connecting to MetaMask...");
    try {
        ethersProvider = new ethers.providers.Web3Provider(window.ethereum, "any");
        await ethersProvider.send("eth_requestAccounts", []);
        ethersSigner = ethersProvider.getSigner();
        currentAdminAddress = await ethersSigner.getAddress();

        const network = await ethersProvider.getNetwork();
        if (network.chainId !== expectedChainId) {
            throw new Error(`Incorrect network. Please connect to Chain ID ${expectedChainId} (Current: ${network.chainId}).`);
        }

        walletStatusAdminEl.textContent = `Connected: ${currentAdminAddress.slice(0, 6)}...${currentAdminAddress.slice(-4)}`;
        connectWalletBtnAdminEl.textContent = 'Disconnect Wallet';

        logToScreen(`Wallet connected: ${currentAdminAddress}`, "success");
        await verifyAdminStatus(); // 여기서 hideLoading은 verifyAdminStatus 내부에서 처리

    } catch (error) {
        console.error("Connection/Verification Error:", error);
        logToScreen(`Connection Error: ${error.message}`, "error");
        alert(`Connection Error: ${error.message}`);
        disconnectAdminWallet(); // 내부에서 hideLoading 없음
        hideLoading(); // 명시적 로딩 해제
    }
}

function disconnectAdminWallet() {
    // 이 함수는 UI 상태만 변경, show/hideLoading은 호출부에서 관리
    ethersProvider = null;
    ethersSigner = null;
    currentAdminAddress = null;
    isAdminVerified = false;
    slotMachineContractInstance = null;

    if (walletStatusAdminEl) walletStatusAdminEl.textContent = 'Status: Not Connected';
    if (adminAuthStatusEl) adminAuthStatusEl.textContent = 'Admin Auth: Not Verified';
    if (adminPanelDivEl) adminPanelDivEl.style.display = 'none';
    if (connectWalletBtnAdminEl) connectWalletBtnAdminEl.textContent = 'Connect Admin Wallet';
    logToScreen("Wallet disconnected.", "info");
    setAdminInputsDisabled(true);
}

async function verifyAdminStatus() {
    if (!ethersSigner || !slotMachineAddress || !slotMachineAbi) {
        if (adminAuthStatusEl) adminAuthStatusEl.textContent = 'Admin Auth: Cannot verify (Prerequisites missing)';
        adminPanelDivEl.style.display = 'none'; // 관리자 기능 숨김
        return;
    }
    showLoading("Verifying admin privileges...");
    try {
        slotMachineContractInstance = new ethers.Contract(slotMachineAddress, slotMachineAbi, ethersSigner);
        const ownerAddress = await slotMachineContractInstance.owner();
        isAdminVerified = (ownerAddress.toLowerCase() === currentAdminAddress.toLowerCase());

        if (isAdminVerified) {
            adminAuthStatusEl.textContent = 'Admin Auth: Verified (You are the Owner)';
            adminPanelDivEl.style.display = 'block';
            logToScreen("Admin status verified successfully.", "success");
        } else {
            adminAuthStatusEl.textContent = 'Admin Auth: Failed (Connected account is NOT the owner)';
            adminPanelDivEl.style.display = 'none';
            logToScreen("Admin verification failed: Connected account is not the owner.", "error");
            alert("Access Denied: You are not the contract owner.");
        }
    } catch (error) {
        console.error("Error verifying admin status:", error);
        adminAuthStatusEl.textContent = `Admin Auth: Error - ${error.message}`;
        adminPanelDivEl.style.display = 'none';
        logToScreen(`Error verifying admin status: ${error.message}`, "error");
    } finally {
        // setAdminInputsDisabled는 hideLoading 내부에서 호출되므로 여기서 중복 호출 방지
        hideLoading();
    }
}

function handleMetaMaskAccountsChanged(accounts) {
    logToScreen("MetaMask account changed.", "info");
    if (currentAdminAddress && (accounts.length === 0 || accounts[0].toLowerCase() !== currentAdminAddress.toLowerCase())) {
        showLoading("Account changed. Disconnecting...");
        disconnectAdminWallet();
        hideLoading();
        alert("Your MetaMask account has changed. Please reconnect if you wish to continue as admin.");
    } else if (!currentAdminAddress && accounts.length > 0) {
        logToScreen("New account detected. You may now connect.", "info");
    }
}

function handleMetaMaskChainChanged(_chainId) {
    const chainId = Number(_chainId);
    logToScreen(`MetaMask network changed to Chain ID: ${chainId}. Verifying...`, "info");
    if (chainId !== expectedChainId) {
        showLoading("Incorrect network. Disconnecting...");
        disconnectAdminWallet();
        hideLoading();
        alert(`Network changed. Please connect to the correct network (Chain ID: ${expectedChainId}).`);
    } else if (currentAdminAddress) {
        // 올바른 체인으로 변경되었고, 이전에 연결된 주소가 있었다면 다시 연결 및 관리자 상태 확인
        connectAdminWallet(); 
    }
}

// --- Batch Spin Grant Logic ---
async function handleGrantBatchSpins() {
    if (!isAdminVerified || !slotMachineContractInstance) {
        alert("Admin not verified or contract not ready. Please connect a valid admin wallet.");
        return;
    }

    const addressesRaw = playerAddressesTextareaEl.value.trim();
    const countPerPlayer = parseInt(spinsPerPlayerInputAdminEl.value);

    if (isNaN(countPerPlayer) || countPerPlayer < 1 || countPerPlayer > 50) {
        logToScreen("Invalid 'Spins per Player' value. Must be between 1 and 50.", "error");
        alert("Invalid 'Spins per Player' value. Must be between 1 and 50.");
        return;
    }

    const rawAddressList = addressesRaw.split('\n').map(addr => addr.trim()).filter(addr => addr);
    const validAddresses = [];
    const invalidAddresses = [];

    for (const addr of rawAddressList) {
        if (ethers.utils.isAddress(addr)) {
            validAddresses.push(addr);
        } else {
            invalidAddresses.push(addr);
        }
    }

    if (invalidAddresses.length > 0) {
        const msg = `Skipping ${invalidAddresses.length} invalid addresses: ${invalidAddresses.join(', ')}`;
        logToScreen(msg, "error");
        alert(`Warning: ${msg}`);
    }

    if (validAddresses.length === 0) {
        logToScreen("No valid Ethereum addresses provided to grant spins.", "error");
        alert("No valid Ethereum addresses provided.");
        return;
    }
    
    if (validAddresses.length > 100) {
        logToScreen("Too many addresses. Please provide up to 100 addresses at a time for this UI.", "error");
        alert("Please input up to 100 addresses at a time.");
        return;
    }

    // const totalAddresses 선언 위치 수정
    const totalAddresses = validAddresses.length; 

    showLoading(`Starting batch spin grant process for ${totalAddresses} addresses...`);
    logToScreen(`Attempting to grant ${countPerPlayer} spins to ${totalAddresses} addresses. This may take several transactions.`, "info");
    transactionLogAdminUlEl.innerHTML = ''; 
    overallProgressDivEl.textContent = `Processed 0 / ${totalAddresses} addresses.`;

    const CHUNK_SIZE = 5;
    let totalSuccessfullyProcessed = 0;
    let totalFailedAddresses = 0;

    for (let i = 0; i < totalAddresses; i += CHUNK_SIZE) { // totalAddresses 변수 사용
        const addressChunk = validAddresses.slice(i, i + CHUNK_SIZE);
        const currentBatchIndex = (i / CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(totalAddresses / CHUNK_SIZE); // totalAddresses 변수 사용
        
        showLoading(`Processing Batch ${currentBatchIndex}/${totalBatches} (${addressChunk.length} addresses)...`);
        logToScreen(`Batch ${currentBatchIndex}/${totalBatches}: Processing addresses - ${addressChunk.join(', ')}`, "pending");

        try {
            const tx = await slotMachineContractInstance.grantFreeSpinsBatch(addressChunk, countPerPlayer);
            logToScreen(`Batch ${currentBatchIndex}: Transaction sent (TX: ${tx.hash.slice(0,12)}...). Waiting for confirmation...`, "pending");
            showLoading(`Batch ${currentBatchIndex}/${totalBatches} - Confirming TX: ${tx.hash.slice(0,10)}...`);
            
            const receipt = await tx.wait(1);

            if (receipt.status === 1) {
                logToScreen(`Batch ${currentBatchIndex}: Success! ${countPerPlayer} spins granted to ${addressChunk.length} players. (TX: ${tx.hash.slice(0,12)})`, "success");
                totalSuccessfullyProcessed += addressChunk.length;
            } else {
                logToScreen(`Batch ${currentBatchIndex}: Transaction FAILED on-chain for addresses: ${addressChunk.join(', ')}. (TX: ${tx.hash.slice(0,12)})`, "error");
                totalFailedAddresses += addressChunk.length;
            }
        } catch (error) {
            console.error(`Error in Batch ${currentBatchIndex}:`, error);
            let errMsg = error.reason || (error.data ? error.data.message : null) || error.message || 'Unknown error';
            logToScreen(`Batch ${currentBatchIndex}: ERROR - ${errMsg}. Addresses: ${addressChunk.join(', ')}`, "error");
            totalFailedAddresses += addressChunk.length;
        }
        // 여기에서 totalAddresses를 사용합니다.
        overallProgressDivEl.textContent = `Processed ${i + addressChunk.length} / ${totalAddresses} addresses. Success: ${totalSuccessfullyProcessed}, Failed: ${totalFailedAddresses}`;
        
        if (i + CHUNK_SIZE < totalAddresses) { // totalAddresses 변수 사용
            logToScreen("Waiting briefly before next batch...", "info");
            showLoading(`Waiting for next batch... (${totalBatches - currentBatchIndex} remaining)`);
            await new Promise(resolve => setTimeout(resolve, 2000)); 
        }
    }

    const finalMessage = `Batch Grant Complete! 
    Successfully processed: ${totalSuccessfullyProcessed} addresses.
    Failed for: ${totalFailedAddresses} addresses.`;
    logToScreen(finalMessage, totalFailedAddresses > 0 ? "error" : "success");
    alert(finalMessage);
    playerAddressesTextareaEl.value = "";
    hideLoading(); // 전체 작업 완료 후 로딩 해제
}