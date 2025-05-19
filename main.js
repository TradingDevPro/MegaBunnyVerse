// main.js – 트위터 링크 추가, UI 상태 관리 강화, 로딩 상태, 메시지 영어화
// (낙관적 업데이트 제외, 구조적 개선 적용)

// 전역 변수 선언 (애플리케이션 전체에서 공유)
let connectButton, walletDisplay; // p5.Element 객체들
let walletAddress = "";          // 현재 연결된 지갑 주소
let provider, signer;         // Ethers provider 및 signer 객체 (wallet.js에서 할당)
let isConnected = false;          // 지갑 연결 상태 (wallet.js에서 관리)
//let isAdmin = false;              // 관리자 여부 (wallet.js에서 관리)

let bgImage; // 배경 이미지 p5.Image 객체
let twitterLink; // 트위터 링크용 p5.Element

let slotImages = []; // 슬롯 이미지 p5.Image 객체 배열
const totalImages = 9; // 총 슬롯 이미지 개수 (utils.js 등에서도 참조 가능)
let reels = [];      // 각 릴의 상태를 담는 객체 배열
const reelHeight = 150, reelWidth = 150; // 릴 크기 상수

let spinning = false, result = ''; // 게임 진행 상태 변수
let score = 0, playCredits = 0; // 현재 점수 및 남은 스핀 수
let gameStarted = false;          // 게임 화면 표시 여부 상태

let spinButton, resetButton, claimButton, insertButtons = []; // UI 버튼 p5.Element 객체들
let scoreBreakdown = []; // 점수 상세 내역 (evaluateResult에서 채워짐)

// 토큰 정보 표시용 UI 요소 (p5.Element)
let tokenInfoBox;
// 변수명은 tmong으로 유지하되, 실제 내용은 tMBV를 표시하도록 함
let tmongBalanceDiv; 
let tmongInfoDiv;
let addTMongTokenLink; // 함수명/변수명은 TMong을 유지하고, 실제 기능은 tMBV를 추가하도록 함

// <<< playerSession 전역 변수 선언 및 초기화 >>>
let playerSession = {
    wallet: "",
    seeds: [],
    paidSeeds: [],
    totalScore: 0
};

// 버튼 크기 및 위치 관련 상수
const BACK_W  = 160;
const CLAIM_W = 140; // Claim 버튼 너비 조정 가능
const GAP_W   = 20;
const BTN_Y   = 480;

// ===== 로딩 상태 관련 전역 변수 및 함수 =====
let globalIsLoading = false;
let globalLoadingMessage = '';

function showLoading(message) {
    console.log(`[Loading] Show: ${message}`);
    globalIsLoading = true;
    globalLoadingMessage = message;

    const elementsToDisable = [
        connectButton, ...insertButtons, spinButton, resetButton, claimButton,
        ...(typeof adminToolComponents !== 'undefined' ? Object.values(adminToolComponents) : []),
        ...(typeof adminToolButtons !== 'undefined' ? adminToolButtons : [])
    ];

    elementsToDisable.forEach(el => {
        if (el && el.elt && typeof el.attribute === 'function') {
            el.attribute('disabled', 'true');
        }
    });
}

function hideLoading() {
    console.log("[Loading] Hide. Current state: isConnected=", isConnected, "gameStarted=", gameStarted, "claimMode=", claimMode(), "playCredits=", playCredits, "spinning=", spinning, "isAdmin=", typeof isAdmin !== 'undefined' ? isAdmin: 'undefined');
    globalIsLoading = false;
    globalLoadingMessage = '';

    if (connectButton && connectButton.elt) {
        connectButton.removeAttribute('disabled');
    }

    const showInsertButtonsUI = isConnected && !gameStarted && !claimMode();
    insertButtons.forEach(btn => {
        if (btn && btn.elt) {
            if (showInsertButtonsUI) {
                btn.show(); btn.removeAttribute('disabled');
            } else {
                btn.hide(); btn.attribute('disabled', 'true');
            }
        }
    });

    const showSpinButtonUI = isConnected && gameStarted && playCredits > 0 && !spinning && !claimMode();
    if (spinButton && spinButton.elt) {
        if (showSpinButtonUI) {
            spinButton.show(); spinButton.removeAttribute('disabled');
            console.log("Spin button VISIBLE AND ENABLED");
        } else {
            spinButton.hide(); spinButton.attribute('disabled', 'true');
            console.log("Spin button HIDDEN OR DISABLED");
        }
    }

    const showResetButtonUI = isConnected && gameStarted && playCredits <= 0 && !spinning && !claimMode();
    if (resetButton && resetButton.elt) {
        if (showResetButtonUI) {
            resetButton.show(); resetButton.removeAttribute('disabled');
        } else {
            resetButton.hide(); resetButton.attribute('disabled', 'true');
        }
    }
    // Claim 버튼 레이블 변경
    const showClaimButtonUI = isConnected && claimMode();
    if (claimButton && claimButton.elt) {
        if (showClaimButtonUI) {
            claimButton.show(); claimButton.removeAttribute('disabled');
        } else {
            claimButton.hide(); claimButton.attribute('disabled', 'true');
        }
    }

    const adminElements = [
        ...(typeof adminToolComponents !== 'undefined' ? Object.values(adminToolComponents) : []),
        ...(typeof adminToolButtons !== 'undefined' ? adminToolButtons : [])
    ];
    adminElements.forEach(el => {
        if (el && el.elt && typeof el.removeAttribute === 'function') {
            if (typeof isAdmin !== 'undefined' && isAdmin) { 
                el.removeAttribute('disabled');
                if (typeof el.show === 'function' && el !== connectButton) el.show();
            } else {
                el.attribute('disabled', 'true');
                if (typeof el.hide === 'function' && el !== connectButton ) {
                    el.hide();
                }
            }
        }
    });
}
// ===== 로딩 상태 관련 전역 변수 및 함수 끝 =====

function preload() {
    for (let i = 1; i <= totalImages; i++) {
        let imagePath = `img/${i}.jpg`;
        slotImages.push(loadImage(imagePath));
    }
    bgImage = loadImage('./bg3.jpg');
    // 만약 트위터 아이콘 이미지를 사용한다면 여기서 로드:
    // twitterIcon = loadImage('./img/twitter_icon.png'); 
}

function setup() {
    let cnv = createCanvas(780, 530);
    try {
        if (drawingContext?.canvas) drawingContext.canvas.willReadFrequently = true;
    } catch (e) { console.warn("[Setup] Error setting willReadFrequently:", e); }

    textAlign(CENTER, CENTER);

    connectButton = createButton("🦊 Connect Wallet")
        .position(20, 20) // X, Y
        .mousePressed(async () => {
            if (globalIsLoading) return;
            if (typeof connectWallet === 'function') await connectWallet(); // wallet.js
            else { console.error("connectWallet function is not defined."); alert("Wallet connection unavailable."); }
        });

    walletDisplay = createDiv("")
        .style("font-size", "12px")
        .style("font-family", "monospace")
        .style("line-height", "1.5")
        .style("text-align", "left")
        .style("padding-left", "5px")
        .style("width", "150px") // 너비 지정
        .position(connectButton.x, connectButton.y + connectButton.height + 5); // 버튼 바로 아래 + 여백 5px

    // 트위터 링크 추가 (우측 상단)
    twitterLink = createA('https://twitter.com/megabunny_', '🐦 Follow us on X', '_blank'); // 새 탭에서 열기, 텍스트 변경
    twitterLink.position(width - twitterLink.width - 20, 20); // 우측 상단 위치 (여백 고려하여 동적 계산)
    twitterLink.style('font-size', '12px'); // 폰트 크기 조정
    twitterLink.style('text-decoration', 'none');
    twitterLink.style('color', '#000000'); // 트위터 X 로고 색상 (검정) 또는 #1DA1F2 (기존 블루)
    twitterLink.style('padding', '5px 8px');
    twitterLink.style('border', '1px solid #ccc');
    twitterLink.style('border-radius', '5px');
    twitterLink.style('background-color', '#f0f0f0');


    if (typeof setupInsertButtons === 'function') setupInsertButtons(); // ui.js
    else console.error("setupInsertButtons function is not defined.");

    setupButtons(); // 이 함수에서 claimButton 레이블도 변경
    positionBottomButtons();

    if (typeof createReel === 'function') { // utils.js
        for (let i = 0; i < 3; i++) reels.push(createReel());
    } else console.error("createReel function is not defined.");

    const tokenInfoBoxWidth = 380;
    const tokenInfoBoxHeight = 80;
    const tokenInfoBoxY = BTN_Y - tokenInfoBoxHeight - 25;

    tokenInfoBox = createDiv('')
        .position(width / 2 - tokenInfoBoxWidth / 2, tokenInfoBoxY)
        .size(tokenInfoBoxWidth, tokenInfoBoxHeight)
        .style('background-color', 'rgba(255, 255, 255, 0.85)')
        .style('border', '1px solid black')
        .style('border-radius', '10px')
        .style('padding', '10px')
        .style('box-sizing', 'border-box')
        .style('display', 'flex')
        .style('flex-direction', 'column')
        .style('align-items', 'center')
        .style('justify-content', 'space-around')
        .style('text-align', 'center')
        .hide();

    tmongBalanceDiv = createDiv('').style('font-size', '14px').style('color', 'black').parent(tokenInfoBox);
    tmongInfoDiv = createDiv('').style('font-size', '10px').style('color', '#333').style('word-break', 'break-all').parent(tokenInfoBox);

    // Add Token 버튼 텍스트 변경
    addTMongTokenLink = createA('javascript:void(0);', 'Add $tMBV to MetaMask') 
        .style('font-size', '10px')
        .style('color', '#007bff')
        .style('text-decoration', 'underline')
        .style('cursor', 'pointer')
        .parent(tokenInfoBox)
        .mousePressed(() => {
            if (globalIsLoading) return;
            // window.addTMongToMetamask 함수는 wallet.js에 정의됨, 이름은 유지
            if (typeof window.addTMongToMetamask === 'function') window.addTMongToMetamask(); 
            else { console.error("addTMongToMetamask function not defined."); alert("MetaMask integration unavailable."); }
        });
    hideLoading(); // 초기 로딩 완료 후 버튼 상태 정상화
}

// wallet.js 에서 호출될 때 tMBV 주소를 전달받음
function updateTokenInfoUI(balance, tokenCa) { 
    if (tokenInfoBox) {
        if (tmongBalanceDiv) tmongBalanceDiv.html(`My Balance: ${balance !== null ? balance : 'Loading...'}`);
        // CA 정보 표시 시 토큰 심볼도 함께 표시 가능
        if (tmongInfoDiv) tmongInfoDiv.html(`$tMBV CA: ${tokenCa || 'N/A'}`); 
    }
}

function hideTokenInfoUI() {
    if (tokenInfoBox?.hide) tokenInfoBox.hide();
}

async function fetchAndUpdateTokenInfo() {
    // window.__TMONG_ADDR__ 대신 window.__TMBV_ADDR__ 또는 일반화된 변수명을 사용 (wallet.js에서 설정)
    if (!isConnected || !walletAddress || !window.__TOKEN_ADDR__) { 
        hideTokenInfoUI(); return;
    }
    try {
        // getTMongBalance 함수명은 유지, 내부적으로 tMBV 처리 (wallet.js)
        if (typeof getTMongBalance === 'function') { 
            const balance = await getTMongBalance(walletAddress);
            // updateTokenInfoUI 호출 시에도 새 토큰 주소 전달
            updateTokenInfoUI(balance, window.__TOKEN_ADDR__); 
        } else {
            console.error("getTMongBalance function not defined.");
            updateTokenInfoUI("Error", window.__TOKEN_ADDR__);
        }
    } catch (error) {
        console.error("Error in fetchAndUpdateTokenInfo:", error);
        updateTokenInfoUI("Error fetching", window.__TOKEN_ADDR__);
    }
}

function draw() {
    if (bgImage?.width > 0 && bgImage?.height > 0) {
        push(); tint(255, 77); image(bgImage, 0, 0, width, height); pop();
    } else background(240);

    if (!isConnected) {
        fill(0); textSize(20); textAlign(CENTER, CENTER);
        text("🦊 Please connect your wallet to play.", width / 2, height / 2 - 50);
        hideTokenInfoUI();
        if(Array.isArray(insertButtons)) insertButtons.forEach(b => {if(b?.hide) b.hide();});
        if(spinButton?.hide) spinButton.hide();
        if(resetButton?.hide) resetButton.hide();
        if(claimButton?.hide) claimButton.hide();

    } else if (claimMode()) {
        layoutClaimMode();
        hideTokenInfoUI();
        if(Array.isArray(insertButtons)) insertButtons.forEach(b => {if(b?.hide) b.hide();});
        if(spinButton?.hide) spinButton.hide();
        if(resetButton?.hide) resetButton.hide();

        if (typeof drawGameScreen === 'function') drawGameScreen();
        if (typeof drawResultText === 'function') drawResultText();
        if (typeof drawScoreBreakdown === 'function') drawScoreBreakdown();
    } else if (!gameStarted) {
        if (typeof drawInsertCoinScreen === 'function') drawInsertCoinScreen();
        if (tokenInfoBox) tokenInfoBox.show();
        if(Array.isArray(insertButtons)) insertButtons.forEach(b => {if(b?.show) b.show();});
        if(spinButton?.hide) spinButton.hide();
        if(resetButton?.hide) resetButton.hide();
        if(claimButton?.hide) claimButton.hide();
    } else {
        hideTokenInfoUI();
        if(Array.isArray(insertButtons)) insertButtons.forEach(b => {if(b?.hide) b.hide();});

        if (typeof drawGameScreen === 'function') drawGameScreen();
        if (typeof updateReelAnimations === 'function' && spinning) {
            updateReelAnimations();
        }
        if (!spinning && result) {
            if (typeof drawResultText === 'function') drawResultText();
            if (typeof drawScoreBreakdown === 'function') drawScoreBreakdown();
        }
    }

    if (spinning && reels.every(r => r.spinSpeeds && r.spinSpeeds.length === 0)) {
        spinning = false;
        if (typeof evaluateResult === 'function') evaluateResult();
        else console.error("evaluateResult function not defined.");
        if (!globalIsLoading) hideLoading();
    }

    if (globalIsLoading) {
        push();
        fill(10, 10, 10, 200); rect(0, 0, width, height);
        fill(255); textSize(22); textAlign(CENTER, CENTER);
        text(globalLoadingMessage, width / 2, height / 2);
        translate(width / 2, height / 2 + 50); stroke(255); strokeWeight(3); noFill();
        let arcEnd = map(sin(frameCount * 0.1), -1, 1, HALF_PI, TWO_PI - QUARTER_PI);
        arc(0, 0, 30, 30, 0, arcEnd);
        pop();
    }
}

const claimMode = () =>
    typeof hasRemainingSeeds === 'function' && !hasRemainingSeeds() && playCredits === 0 && score > 0;

function setupButtons() {
    spinButton = createButton('SPIN')
        .size(80, 40)
        .mousePressed(async () => {
            if (globalIsLoading) return;
            if (!isConnected) return alert("🦊 Please connect your wallet first.");
            if (playCredits <= 0) { alert("🎰 Please insert coins! (No credits to spin)"); return; }
            if (spinning) return;
            if (typeof startSpin !== 'function') { console.error("startSpin function not defined."); return; }
            await startSpin();
            if (!globalIsLoading) hideLoading();
        })
        .hide();

    resetButton = createButton('← Back to Insert Coin')
        .size(BACK_W, 40)
        .mousePressed(() => {
            if (globalIsLoading) return;
            restoreDefaultLayout();
        })
        .hide();

    // Claim 버튼 레이블 변경
    claimButton = createButton('💰 Claim $tMBV') 
        .size(CLAIM_W + 20, 40) // $tMBV가 길어서 너비 약간 증가
        .mousePressed(async () => {
            if (globalIsLoading) return;
            if (typeof claimTokens !== 'function') { console.error("claimTokens function not defined."); return; }
            await claimTokens();
        })
        .hide();
}

function positionBottomButtons() {
    if (resetButton) resetButton.position(width / 2 - resetButton.width / 2, BTN_Y);
    if (spinButton) spinButton.position(width / 2 - spinButton.width / 2, BTN_Y);
    if (claimButton) claimButton.position(width / 2 - claimButton.width / 2, BTN_Y);
}

function layoutClaimMode() {
    if (claimButton) {
        claimButton.position(width / 2 - claimButton.width / 2, BTN_Y);
    }
}

function restoreDefaultLayout() {
    console.log("[restoreDefaultLayout] Called. Resetting to insert coin screen state.");
    gameStarted = false;
    result = '';
    spinning = false;

    if (typeof fetchAndUpdateTokenInfo === 'function' && isConnected) {
        fetchAndUpdateTokenInfo();
    }
    if (typeof hideLoading === 'function' && !globalIsLoading) {
      hideLoading();
    }
}