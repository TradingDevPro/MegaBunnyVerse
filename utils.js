// utils.js - createReel 함수 수정하여 finalIndex 명시적 초기화

/**
 * 배열의 요소를 무작위로 섞습니다. (Fisher-Yates shuffle)
 * @param {Array} arr 섞을 배열
 * @returns {Array} 섞인 배열 (원본 배열 변경)
 */
function shuffle(arr) {
  let i = arr.length, r;
  while (i) {
      r = Math.floor(Math.random() * i--);
      [arr[i], arr[r]] = [arr[r], arr[i]];
  }
  return arr;
}

// 슬롯 머신 배율 정의 (0-indexed 이미지 기준)
// 예: 인덱스 5 (6번째 이미지)는 2배
const SLOT_MULTIPLIERS = { 5: 2, 6: 3, 7: 4, 8: 5 };

/**
* 7자리 시드 문자열에서 특정 위치의 숫자들을 추출하여 0-indexed 이미지 인덱스 배열로 반환합니다.
* @param {string} seed 7자리 시드 문자열 (예: "1234567")
* @returns {Array<number>} 3개의 0-indexed 이미지 인덱스 배열 [a, b, c]
*/
function getSequenceFromSeed(seed) {
  const s = seed.toString().padStart(7, '0');
  // 컨트랙트의 _extractIndices는 2, 4, 6번째 "숫자"(1-9)를 사용 후 0-indexed로 변환.
  // JavaScript 문자열 인덱스는 0부터 시작: s[1](2번째), s[3](4번째), s[5](6번째)
  return [
      parseInt(s[1]) - 1, // 0-indexed
      parseInt(s[3]) - 1, // 0-indexed
      parseInt(s[5]) - 1  // 0-indexed
  ];
}

/**
* 새로운 릴(reel) 객체를 생성하여 반환합니다.
* totalImages 전역 변수는 main.js 등에서 정의되어 있어야 합니다.
* @returns {object} 초기화된 릴 객체 { offset, y, spinSequence, spinSpeeds, finalIndex }
*/
function createReel() {
  // totalImages가 정의되지 않았다면 기본값 9 사용
  const currentTotalImages = (typeof totalImages !== 'undefined' && totalImages > 0) ? totalImages : 9;
  if (typeof totalImages === 'undefined') {
      console.warn("utils.js: totalImages is not defined globally. createReel will use default value 9.");
  }

  const initialSequence = shuffle([...Array(currentTotalImages).keys()]);
  // 처음 화면에 표시될 이미지 및 스핀 후 최종 결과를 위한 인덱스를 명확히 설정
  // 예: 섞인 시퀀스의 첫 번째 이미지를 초기/최종 표시 이미지로 설정
  const initialDisplayIndex = initialSequence[0]; 

  return { 
      offset: 0,       // 스핀 애니메이션 중 spinSequence 내 현재 위치 오프셋
      y: 0,            // 스핀 애니메이션 중 y축 오프셋
      spinSequence: initialSequence, // 릴에 표시될 전체 이미지 인덱스 순서 (섞여있음)
      spinSpeeds: [],  // 스핀 애니메이션 속도 배열 (비어있으면 멈춘 상태)
      finalIndex: initialDisplayIndex // 스핀 후 최종 결과 또는 초기 표시될 이미지 인덱스
  };
}

// 전역 의존성:
// totalImages (main.js 등에서 선언된 전역 상수 또는 변수)