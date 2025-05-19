// session.js - loadSession이 새 객체를 반환하도록 수정

// playerSession 전역 변수는 main.js 또는 최상위 스코프에서 한 번만 선언하는 것이 좋습니다.
// 여기서는 이 파일이 playerSession을 직접 관리한다고 가정하지 않고,
// loadSession은 데이터를 읽어 객체를 반환하고, saveSession은 전역 playerSession을 사용한다고 가정합니다.
// 만약 playerSession이 이 파일에서만 관리된다면, 아래와 같이 선언할 수 있습니다.
// let playerSession = { /* ... 기본 구조 ... */ }; (하지만 main.js와 공유되어야 함)

/**
 * 지정된 주소에 대한 세션 데이터를 로컬 스토리지에서 로드하여 "새로운" 객체로 반환합니다.
 * 데이터가 없거나 파싱 실패 시, 해당 주소에 대한 기본 빈 세션 객체를 반환합니다.
 * @param {string} address 세션을 로드할 지갑 주소
 * @returns {object} 로드되거나 새로 생성된 세션 객체 { wallet, seeds, paidSeeds, totalScore }
 */
function loadSession(address) {
  const raw = localStorage.getItem(`slot_session_${address}`);
  let sessionDataToReturn = { // 항상 새로운 객체를 생성하여 반환
    wallet: address,
    seeds: [],
    paidSeeds: [],
    totalScore: 0
  };

  if (raw) {
    try {
      const parsedData = JSON.parse(raw);
      // 로드된 데이터로 sessionDataToReturn 객체의 속성을 채움
      sessionDataToReturn.seeds = parsedData.seeds || [];
      sessionDataToReturn.paidSeeds = parsedData.paidSeeds || [];
      sessionDataToReturn.totalScore = parsedData.totalScore || 0;
      console.log("[Session] Loaded session from localStorage for", address);
    } catch (err) {
      console.warn("❌ Failed to parse session data from localStorage for", address, ":", err);
      // 파싱 실패 시 sessionDataToReturn은 이미 기본값으로 초기화되어 있음
    }
  } else {
    console.log("[Session] No session found in localStorage, returning new empty session for", address);
  }
  // console.log("[Session] loadSession returning:", JSON.parse(JSON.stringify(sessionDataToReturn)));
  return sessionDataToReturn; // 로드된 정보로 채워진 새 객체 또는 기본 빈 객체 반환
}

/**
 * 현재 전역 playerSession 객체의 내용을 로컬 스토리지에 저장합니다.
 * playerSession은 main.js 등에서 관리되는 전역 변수여야 합니다.
 */
function saveSession() {
  // playerSession 전역 변수 사용
  if (!playerSession || !playerSession.wallet) {
    // console.warn("[Session] Cannot save session: playerSession or playerSession.wallet is not defined.");
    return;
  }
  try {
    localStorage.setItem(`slot_session_${playerSession.wallet}`, JSON.stringify({
      seeds: playerSession.seeds,
      paidSeeds: playerSession.paidSeeds,
      totalScore: playerSession.totalScore
    }));
    // console.log("[Session] Session saved to localStorage for", playerSession.wallet);
  } catch (e) {
    console.error("[Session] Error saving session to localStorage:", e);
  }
}

/**
 * 현재 전역 playerSession에 사용하지 않은 시드가 있는지 확인합니다.
 * @returns {boolean} 미사용 시드가 있으면 true, 없으면 false
 */
function hasRemainingSeeds() {
  // playerSession 전역 변수 사용
  if (!playerSession) return false;
  return (
    (playerSession.seeds && playerSession.seeds.some(s => !s.used)) ||
    (playerSession.paidSeeds && playerSession.paidSeeds.some(s => !s.used))
  );
}

/**
 * 현재 전역 playerSession에서 다음에 사용할 시드를 가져옵니다 (무료 시드 우선).
 * @returns {object | null} 사용할 시드 객체 (source, value, used, score 포함) 또는 null
 */
function currentSeed() {
  // playerSession 전역 변수 사용
  if (!playerSession) return null;

  if (playerSession.seeds && playerSession.seeds.length > 0) {
    const free = playerSession.seeds.find(s => !s.used);
    if (free) return { source: 'free', ...free };
  }
  if (playerSession.paidSeeds && playerSession.paidSeeds.length > 0) {
    const paid = playerSession.paidSeeds.find(s => !s.used);
    if (paid) return { source: 'paid', ...paid };
  }
  return null;
}

/**
 * 현재 전역 playerSession에서 사용된 시드를 표시하고 점수를 기록한 후 세션을 저장합니다.
 * @param {number} scoreGained 이번 스핀으로 얻은 점수
 */
function markCurrentSeedUsed(scoreGained) {
  // playerSession 전역 변수 사용
  if (!playerSession) return;

  let seedMarked = false;
  // 무료 시드 먼저 확인
  let unusedFreeSeed = playerSession.seeds?.find(s => !s.used);
  if (unusedFreeSeed) {
    unusedFreeSeed.used = true;
    unusedFreeSeed.score = scoreGained;
    seedMarked = true;
  }

  // 무료 시드에서 사용 처리 안됐으면 유료 시드 확인
  if (!seedMarked) {
    let unusedPaidSeed = playerSession.paidSeeds?.find(s => !s.used);
    if (unusedPaidSeed) {
        unusedPaidSeed.used = true;
        unusedPaidSeed.score = scoreGained;
        seedMarked = true;
    }
  }
  
  if(seedMarked) {
    // playerSession.totalScore는 game.js의 evaluateResult에서 score 전역변수를 업데이트하고,
    // 그 score 전역변수를 기반으로 playerSession.totalScore가 업데이트 될 것임 (또는 이미 evaluateResult에서 직접 업데이트)
    // 여기서는 saveSession만 호출하여 변경된 시드 상태를 저장
    saveSession();
  } else {
    // console.warn("[Session] markCurrentSeedUsed: No unused seed found to mark as used.");
  }
}

// 전역 의존성:
// localStorage (브라우저 API)
// playerSession (main.js 등에서 선언 및 관리되는 전역 객체)
