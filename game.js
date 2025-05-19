// game.js – MetaMask 계정 일관성 체크 추가 (전체 버전)

// 전역 변수/함수 의존성 (main.js, utils.js, session.js, wallet.js 등에서 관리)
// isConnected, spinning, reels, playCredits, result, score, scoreBreakdown (main.js)
// currentSeed, markCurrentSeedUsed, saveSession, playerSession (session.js 또는 main.js)
// getSequenceFromSeed, SLOT_MULTIPLIERS (utils.js)
// totalImages, reelHeight (main.js)
// window.checkMetamaskAccountConsistency (wallet.js에서 할당)

async function startSpin() { // async로 변경
  // checkMetamaskAccountConsistency 함수는 wallet.js에 정의, window 객체 통해 접근
  if (typeof window.checkMetamaskAccountConsistency === 'function' && !(await window.checkMetamaskAccountConsistency())) {
      return; // 계정 불일치 시 스핀 중단
  }

  // isConnected, spinning, playCredits는 main.js 등에서 관리되는 전역 변수
  if (!isConnected) return alert("🦊 Please connect your wallet first.");
  if (spinning) return;

  // currentSeed 함수는 session.js에 정의
  const seedObj = typeof currentSeed === 'function' ? currentSeed() : null;
  if (!seedObj) {
    if (playCredits <= 0) {
        alert("🎰 코인을 넣어주세요! (No credits left)");
    } else {
        alert("❌ 사용 가능한 시드가 없습니다. (No seeds available despite having credits)");
    }
    return;
  }

  // getSequenceFromSeed 함수는 utils.js에 정의
  const seq = getSequenceFromSeed(seedObj.value);
  setReelSequences(seq); // 이 파일 내 정의

  if (typeof playCredits !== 'undefined') playCredits--;
  else console.warn("playCredits is undefined in startSpin");

  // result, spinning, reels는 main.js 등에서 관리되는 전역 변수/객체
  result = ''; 
  spinning = true;
  reels.forEach(r => { r.y = 0; r.offset = 0; /* r.spinSpeeds는 setReelSequences에서 설정됨 */ });
}

/* ---------- 릴 회전 시퀀스 ---------- */
// reels, totalImages는 main.js의 전역 변수
function setReelSequences(targetIdxArr) {
  const baseTurns = [4, 5, 6]; 
  for (let i = 0; i < 3; i++) {
    const totalSpinSteps = baseTurns[i] * totalImages; 
    const spinSeq = generateSpinSequenceByTarget(targetIdxArr[i], totalSpinSteps, totalImages); // 이 파일 내 정의

    let speed = (36 - i * 2) * 2; 
    const speeds = [];
    for (let s = 0; s < totalSpinSteps; s++) {
      speeds.push(speed);
      if (s % 4 === 0 && speed > 5) {
        speed -= 1;
      } else if (s >= totalSpinSteps - totalImages && speed > 1) { 
        speed = Math.max(1, speed - 2); 
      }
    }
    reels[i] = { 
        offset: 0, 
        y: 0, 
        spinSequence: spinSeq, 
        spinSpeeds: speeds, 
        finalIndex: targetIdxArr[i] // 최종 결과를 저장
    };
  }
}

// targetIdx: 최종적으로 보여야 할 이미지의 인덱스
// totalSteps: 릴이 회전하는 총 단계 수
// totalNumImages: 릴에 있는 전체 이미지 수 (예: 9)
function generateSpinSequenceByTarget(targetIdx, totalSteps, totalNumImages = 9) {
  const longSeq = [];
  // 애니메이션 종료 시 spinSequence[offset]이 targetIdx를 가리키도록 하기 위한 시퀀스 생성.
  // 가장 간단한 방법은 릴이 멈출 때 offset을 targetIdx로 설정하는 것이나,
  // 여기서는 릴 스트립 자체가 targetIdx로 시작하여 순환하도록 만듦 (애니메이션 로직과 연계).
  // 또는, 릴 스트립은 0~N-1 순서로 고정하고, 애니메이션 종료 시 offset이 targetIdx를 가리키도록.
  // 현재는 targetIdx로 시작하는 시퀀스를 만들어 updateReelAnimations에서 y와 offset을 단순 증가시킴.
  // 최종 결과는 reel.finalIndex를 사용.
  let current = targetIdx; 
  for (let i = 0; i < totalSteps; i++) { 
    longSeq.push(current); 
    current = (current + 1) % totalNumImages; 
  }
  return longSeq;
}


/* ---------- 릴 애니메이션 ---------- */
// reels, reelHeight는 main.js의 전역 변수/상수
function updateReelAnimations() {
  reels.forEach(r => {
    if (!r.spinSpeeds || r.spinSpeeds.length === 0) return; 
    r.y += r.spinSpeeds[0]; 

    if (r.y >= reelHeight) { 
      r.y -= reelHeight;     
      r.offset = (r.offset + 1); // spinSequence를 순환하기 위한 offset
                                  // 이 offset은 spinSequence의 길이 내에서 유효해야 함.
                                  // 현재 spinSequence는 totalSteps 길이이므로, offset은 이 값을 넘지 않음.
      r.spinSpeeds.shift(); 

      if (r.spinSpeeds.length === 0) { 
        r.y = 0; 
        // 스핀 종료 시 offset은 최종 상태를 반영 (ui.js의 drawGameScreen은 finalIndex 사용)
      }
    }
  });
}


/* ---------- 결과 평가 (옵션 2 점수 정책 적용) ---------- */
// reels, SLOT_MULTIPLIERS, score, scoreBreakdown, result, playerSession, markCurrentSeedUsed, saveSession는
// main.js, utils.js, session.js 등에서 관리되는 전역 변수/객체/함수
function evaluateResult() {
  const finalSymbolIndices = reels.map(r => r.finalIndex); // 각 릴에 저장된 최종 결과 인덱스 사용
  const [a, b, c] = finalSymbolIndices; 

  // console.log("[evaluateResult] Final symbols (0-indexed):", a, b, c);

  const counts = {}; 
  [a, b, c].forEach(symbolIndex => counts[symbolIndex] = (counts[symbolIndex] || 0) + 1);

  let addedScore = 0;
  scoreBreakdown = []; // scoreBreakdown은 main.js의 전역 배열
  const maxCount = Math.max(...Object.values(counts));
  const uniqueSymbolIndices = Object.keys(counts).map(Number);

  if (maxCount === 3) { // 트리플 매치
    const tripleSymbolIndex = uniqueSymbolIndices[0];
    const multiplier = SLOT_MULTIPLIERS[tripleSymbolIndex] || 1; // utils.js
    const baseScore = 10000 * multiplier;
    addedScore += baseScore;
    scoreBreakdown.push({ imgIndex: tripleSymbolIndex, base: 10000, multiplier: multiplier, total: baseScore, count: 3 });
    result = `🎉 Triple Match! +${baseScore}`; // result는 main.js의 전역 변수
  } else if (maxCount === 2) { // 더블 매치
    const pairSymbolIndex = uniqueSymbolIndices.find(idx => counts[idx] === 2);
    const soloSymbolIndex = uniqueSymbolIndices.find(idx => counts[idx] === 1);
    
    const pairMultiplier = SLOT_MULTIPLIERS[pairSymbolIndex] || 1;
    const basePairScore = 1000 * pairMultiplier;
    addedScore += basePairScore;
    scoreBreakdown.push({ imgIndex: pairSymbolIndex, base: 1000, multiplier: pairMultiplier, total: basePairScore, count: 2 });

    // 옵션 2 정책: 솔로 심볼이 특수 심볼(인덱스 5 이상)일 때만 보너스
    if (soloSymbolIndex >= 5) { 
        const soloMultiplier = SLOT_MULTIPLIERS[soloSymbolIndex] || 1;
        const soloBonusScore = 100 * soloMultiplier;
        addedScore += soloBonusScore;
        scoreBreakdown.push({ imgIndex: soloSymbolIndex, base: 100, multiplier: soloMultiplier, total: soloBonusScore, count: 1 });
    }
    result = `✨ Double Match! +${addedScore}`;
  } else { // 노매치 (옵션 2 정책: 특수 심볼만 보너스)
    [a, b, c].forEach(symbolIndex => {
      if (symbolIndex >= 5) { 
        const multiplier = SLOT_MULTIPLIERS[symbolIndex] || 1;
        const bonusScore = 100 * multiplier;
        addedScore += bonusScore;
        scoreBreakdown.push({ imgIndex: symbolIndex, base: 100, multiplier: multiplier, total: bonusScore, count: 1 });
      }
    });
    result = addedScore > 0 ? `💎 Bonus Score! +${addedScore}` : '🙈 Try Again!';
  }

  score += addedScore; // main.js의 전역 변수

  // markCurrentSeedUsed, playerSession, saveSession은 session.js 및 main.js에서 관리
  if (typeof playerSession !== 'undefined' && (playerSession.seeds?.length > 0 || playerSession.paidSeeds?.length > 0)) {
      if (typeof markCurrentSeedUsed === 'function') { // session.js
          markCurrentSeedUsed(addedScore); 
      } else { console.error("markCurrentSeedUsed function is not defined."); }
  }
  if (typeof playerSession !== 'undefined') {
    playerSession.totalScore = score; // 세션의 totalScore도 UI와 동기화
    if (typeof saveSession === 'function') saveSession(); // session.js
    else console.error("saveSession function is not defined.");
  }
  // console.log("[evaluateResult] Score added:", addedScore, "New total score:", score);
}
