let connectButton;
let walletAddress = "";
let provider, signer;
let isConnected = false;

let slotImages = [];
let totalImages = 9;
let reels = [];
let reelHeight = 150;
let reelWidth = 150;
let spinning = false;
let result = '';
let score = 0;
let playCredits = 0;
let gameStarted = false;
let spinButton;
let resetButton;
let insertButtons = [];

let scoreBreakdown = []; // [{ imgIndex, base, multiplier, total, count }]

function preload() {
  for (let i = 1; i <= totalImages; i++) {
    slotImages.push(loadImage(`img/${i}.jpg`));
  }
}

function setup() {
  createCanvas(780, 480);
  textAlign(CENTER, CENTER);
  textSize(24);

  connectButton = createButton("🦊 Connect Wallet");
  connectButton.position(20, 20);
  connectButton.mousePressed(connectWallet);

  for (let i = 0; i < 3; i++) {
    reels.push(createReel());
  }

  const options = [
    { label: '1 coin - 0.01 MON', plays: 1 },
    { label: '3 coins - 0.025 MON', plays: 3 },
    { label: '5 coins - 0.035 MON', plays: 5 },
    { label: '10 coins - 0.07 MON', plays: 10 }
  ];

  options.forEach((opt, idx) => {
    let btn = createButton(opt.label);
    btn.position(width / 2 - 100, 230 + idx * 45);
    btn.size(200, 35);
    btn.mousePressed(() => {
      playCredits += opt.plays;
      gameStarted = true;
      insertButtons.forEach(b => b.hide());
      spinButton.show();
      resetButton.hide();
    });
    insertButtons.push(btn);
  });

  spinButton = createButton('SPIN');
  spinButton.position(width / 2 - 40, height - 50);
  spinButton.size(80, 40);
  spinButton.mousePressed(startSpin);
  spinButton.hide();

  resetButton = createButton('← Back to Insert Coin');
  resetButton.position(width / 2 - 100, height - 50);
  resetButton.size(200, 40);
  resetButton.mousePressed(() => {
    gameStarted = false;
    spinButton.hide();
    resetButton.hide();
    insertButtons.forEach(b => b.show());
    result = '';
  });
  resetButton.hide();
}

function draw() {
  background(240);

  if (!gameStarted) {
    fill(0);
    textSize(20);
    text("🎰 INSERT COIN TO PLAY 🎰", width / 2, 40);

    textSize(13);
    textAlign(CENTER, TOP);
    text(
      "MONG points earned in the game are paid out as $tMONG tokens on the Monad testnet,\n" +
      "and they will be converted 1:1 into $MONG utility tokens issued on the future Monad mainnet.\n\n" +
      "Additionally, the top 1,000 $tMONG holders will be eligible for a PFP NFT airdrop.",
      width / 2,
      80
    );

    if (walletAddress) {
      textSize(12);
      text("Connected: " + walletAddress, width / 2, 200);
    }
    return;
  }

  textSize(24);
  textAlign(CENTER, CENTER);
  text(`Score: ${score}`, width / 2, 30);
  text(`Credits: ${playCredits}`, width / 2, 65);

  const spacing = 50;
  const startX = (width - (3 * reelWidth + 2 * spacing)) / 2;

  for (let i = 0; i < 3; i++) {
    let x = startX + i * (reelWidth + spacing);
    let reel = reels[i];

    if (!reel || !reel.spinSequence) continue;

    if (reel.spinSpeeds && reel.spinSpeeds.length > 0) {
      reel.y += reel.spinSpeeds[0];
      if (reel.y >= reelHeight) {
        reel.y -= reelHeight;
        if (reel.spinSpeeds.length === 1 && reel.y !== 0) reel.y = 0;
        reel.offset = (reel.offset + 1) % reel.spinSequence.length;
        reel.spinSpeeds.shift();
      }
    }

    push();
    translate(x, 100);
    noFill();
    stroke(0);
    strokeWeight(2);
    drawingContext.beginPath();
    drawingContext.roundRect(0, 0, reelWidth, reelHeight, 20);
    drawingContext.clip();
    image(slotImages[reel.spinSequence[reel.offset]], 0, reel.y, reelWidth, reelHeight);
    image(slotImages[reel.spinSequence[(reel.offset + 1) % totalImages]], 0, reel.y - reelHeight, reelWidth, reelHeight);
    pop();

    push();
    noFill();
    stroke(0);
    strokeWeight(3);
    drawingContext.beginPath();
    drawingContext.roundRect(x, 100, reelWidth, reelHeight, 20);
    drawingContext.stroke();
    pop();
  }

  if (!spinning && result) {
    text(result, width / 2, 320);
  
    if (scoreBreakdown.length > 0) {
      const thumbSize = 35;
      const spacing = 140;
      const startX = width / 2 - ((scoreBreakdown.length - 1) * spacing) / 2;
  
      for (let i = 0; i < scoreBreakdown.length; i++) {
        const { imgIndex, base, multiplier, count } = scoreBreakdown[i];
        const x = startX + i * spacing;
        const y = 360;
  
        // 썸네일 여러개 표시 (둥근 모서리 + 테두리)
        push();
        for (let j = 0; j < count; j++) {
          const offsetX = x + j * (thumbSize + 2);
          stroke(0);
          strokeWeight(2);
          drawingContext.save();
          drawingContext.beginPath();
          drawingContext.roundRect(offsetX, y, thumbSize, thumbSize, 8);
          drawingContext.clip();
          image(slotImages[imgIndex], offsetX, y, thumbSize, thumbSize);
          drawingContext.restore();
          noFill();
          rect(offsetX, y, thumbSize, thumbSize, 8);
        }
        pop();
  
        // 텍스트는 썸네일 오른쪽에 한줄로 표기
        const labelX = x + count * (thumbSize + 5) + 10;
        const labelY = y + thumbSize / 2;
        textAlign(LEFT, CENTER);
        textSize(12);
        fill(0);
        text(`${base}${multiplier > 1 ? ` x ${multiplier}` : ''}`, labelX, labelY);
      }
    }
  }
  

  if (spinning && reels.every(r => r.spinSpeeds.length === 0)) {
    spinning = false;
    evaluateResult();
    if (playCredits <= 0) {
      spinButton.hide();
      resetButton.show();
    }
  }
}

function startSpin() {
  if (spinning || playCredits <= 0) return;

  playCredits--;
  result = '';
  spinning = true;

  for (let i = 0; i < 3; i++) {
    const spinSequence = shuffle([...Array(totalImages).keys()]);
    const steps = 20 + i * 5 + int(random(5));
    let speed = 32;
    let spinSpeeds = [];
    for (let s = 0; s < steps; s++) {
      spinSpeeds.push(speed);
      if (s % 3 === 0 && speed > 4) speed -= 2;
    }

    reels[i] = {
      offset: 0,
      y: 0,
      spinSequence,
      spinSpeeds
    };
  }
}

function evaluateResult() {
  const [a, b, c] = reels.map(r => r.spinSequence[r.offset]);
  const counts = {};
  [a, b, c].forEach(val => counts[val] = (counts[val] || 0) + 1);

  let addedScore = 0;
  let multiplier = 1;
  scoreBreakdown = [];
  const specialMultipliers = { 5: 2, 6: 3, 7: 4, 8: 5 };

  const keys = Object.keys(counts).map(k => parseInt(k));
  const maxCount = Math.max(...Object.values(counts));

  if (maxCount === 3) {
    const imgIdx = keys.find(k => counts[k] === 3);
    addedScore += 10000;
    if (specialMultipliers[imgIdx]) multiplier = specialMultipliers[imgIdx];
    scoreBreakdown.push({
      imgIndex: imgIdx,
      base: 10000,
      multiplier,
      total: 10000 * multiplier,
      count: 3
    });
    result = `🎉 Triple Match! +${10000 * multiplier}`;
  } else if (maxCount === 2) {
    const repeated = keys.find(k => counts[k] === 2);
    const remaining = keys.find(k => counts[k] === 1);
    addedScore += 1000;
    if (specialMultipliers[repeated]) multiplier = specialMultipliers[repeated];
    scoreBreakdown.push({
      imgIndex: repeated,
      base: 1000,
      multiplier,
      total: 1000 * multiplier,
      count: 2
    });

    if ([5, 6, 7, 8].includes(remaining)) {
      const bonus = (remaining - 5 + 1) * 100;
      scoreBreakdown.push({
        imgIndex: remaining,
        base: bonus,
        multiplier: 1,
        total: bonus,
        count: 1
      });
      addedScore += bonus;
    }

    result = `✨ Double Match! +${scoreBreakdown.reduce((sum, s) => sum + s.total, 0)}`;
  } else {
    [a, b, c].forEach(idx => {
      if (idx >= 5 && idx <= 8) {
        const base = (idx - 5 + 1) * 100;
        scoreBreakdown.push({
          imgIndex: idx,
          base,
          multiplier: 1,
          total: base,
          count: 1
        });
        addedScore += base;
      }
    });
    result = addedScore > 0 ? `💎 Bonus Score! +${addedScore}` : '🙈 Try Again!';
  }

  score += addedScore * multiplier;
}

async function connectWallet() {
  if (isConnected) {
    walletAddress = "";
    provider = null;
    signer = null;
    isConnected = false;
    connectButton.html("🦊 Connect Wallet");
    console.log("🔌 Disconnected.");
    return;
  }

  const metamask = getMetamaskProvider();
  if (metamask) {
    try {
      await metamask.request({ method: "eth_requestAccounts" });
      provider = new ethers.BrowserProvider(metamask);
      signer = await provider.getSigner();
      walletAddress = await signer.getAddress();
      isConnected = true;
      connectButton.html("🔓 Disconnect");
      console.log("✅ Connected:", walletAddress);
    } catch (err) {
      console.error("❌ Connection failed:", err);
    }
  } else {
    alert("🦊 Please install Metamask");
  }
}

function getMetamaskProvider() {
  if (window.ethereum?.providers?.length) {
    return window.ethereum.providers.find(p => p.isMetaMask);
  } else if (window.ethereum?.isMetaMask) {
    return window.ethereum;
  }
  return null;
}

function shuffle(array) {
  let currentIndex = array.length, randomIndex;
  while (currentIndex !== 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

function createReel() {
  return {
    offset: 0,
    y: 0,
    spinSequence: shuffle([...Array(totalImages).keys()]),
    spinSpeeds: []
  };
}
