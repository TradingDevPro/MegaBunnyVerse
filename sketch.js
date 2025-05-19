let connectButton;
let walletDisplay;
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

let scoreBreakdown = [];
let freeSeeds = [];
let currentSeedIndex = -1;

function preload() {
  for (let i = 1; i <= totalImages; i++) {
    slotImages.push(loadImage(`img/${i}.jpg`));
  }
}

function setup() {
  createCanvas(780, 530);
  textAlign(CENTER, CENTER);
  textSize(24);

  connectButton = createButton("🦊 Connect Wallet");
  connectButton.position(20, 20);
  connectButton.mousePressed(connectWallet);

  walletDisplay = createDiv("");
  walletDisplay.position(180, 28);
  walletDisplay.style("font-size", "12px");
  walletDisplay.style("font-family", "monospace");

  for (let i = 0; i < 3; i++) {
    reels.push(createReel());
  }

  const options = [
    { label: 'Claim Free Spins (10/day)', type: 'free' },
    { label: 'Buy 20 Games (0.1 MON)', type: 'paid', plays: 20, price: '0.1' },
    { label: 'Buy 50 Games (0.2 MON)', type: 'paid', plays: 50, price: '0.2' },
    { label: 'Buy 100 Games (0.35 MON)', type: 'paid', plays: 100, price: '0.35' }
  ];

  options.forEach((opt, idx) => {
    let btn = createButton(opt.label);
    btn.position(width / 2 - 100, 280 + idx * 45);
    btn.size(200, 35);
    btn.mousePressed(() => {
      if (!isConnected) {
        alert("🦊 Please connect your wallet first.");
        return;
      }
      if (opt.type === 'free') {
        claimFreeSpins();
      } else {
        buyPlays(opt.plays, opt.price);
      }
      insertButtons.forEach(b => b.hide());
      spinButton.show();
      resetButton.hide();
    });
    insertButtons.push(btn);
  });

  spinButton = createButton('SPIN');
  spinButton.position(width / 2 - 40, height - 50);
  spinButton.size(80, 40);
  spinButton.mousePressed(() => {
    if (!isConnected) {
      alert("🦊 Please connect your wallet first.");
      return;
    }
    startSpin();
  });
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

  if (!isConnected) {
    textSize(20);
    fill(0);
    text("🦊 Please connect your wallet to play.", width / 2, height / 2 - 50);
    return;
  }

  if (!gameStarted) {
    fill(0);
    textSize(20);
    text("🎰 INSERT COIN TO PLAY 🎰", width / 2, 90);

    textSize(13);
    textAlign(CENTER, TOP);
    text(
      "MONG points earned in the game are paid out as $tMONG tokens on the Monad testnet,\n" +
      "and they will be converted 1:1 into $MONG utility tokens issued on the future Monad mainnet.\n\n" +
      "Additionally, the top 1,000 $tMONG holders will be eligible for a PFP NFT airdrop.",
      width / 2,
      130
    );

    if (walletAddress) {
      textSize(12);
      text("Connected: " + walletAddress, width / 2, 250);
    }
    return;
  }

  textSize(24);
  text(`Score: ${score}`, width / 2, 80);
  text(`Credits: ${playCredits}`, width / 2, 115);

  const spacing = 50;
  const startX = (width - (3 * reelWidth + 2 * spacing)) / 2;

  for (let i = 0; i < 3; i++) {
    let x = startX + i * (reelWidth + spacing);
    let reel = reels[i];

    if (!reel || !reel.spinSequence) continue;

    if (reel.spinSpeeds.length > 0) {
      reel.y += reel.spinSpeeds[0];
      if (reel.y >= reelHeight) {
        reel.y -= reelHeight;
        if (reel.spinSpeeds.length === 1 && reel.y !== 0) reel.y = 0;
        reel.offset = (reel.offset + 1) % reel.spinSequence.length;
        reel.spinSpeeds.shift();
      }
    }

    push();
    translate(x, 150);
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
    drawingContext.roundRect(x, 150, reelWidth, reelHeight, 20);
    drawingContext.stroke();
    pop();
  }

  if (!spinning && result) {
    text(result, width / 2, 370);
  }

  if (spinning && reels.every(r => r.spinSpeeds.length === 0)) {
    spinning = false;
    evaluateResult();
    if (playCredits <= 0 && currentSeedIndex >= freeSeeds.length - 1) {
      spinButton.hide();
      resetButton.show();
    }
  }
}

function startSpin() {
  if (!isConnected) {
    alert("🦊 Please connect your wallet first.");
    return;
  }
  if (spinning) return;

  if (freeSeeds.length > 0 && currentSeedIndex < freeSeeds.length - 1) {
    currentSeedIndex++;
    const sequence = getSequenceFromSeed(freeSeeds[currentSeedIndex]);
    setReelSequences(sequence);
  } else if (playCredits > 0) {
    playCredits--;
    setReelSequences(shuffle([...Array(totalImages).keys()]));
  } else {
    alert("❌ No credits or seeds left.");
    return;
  }

  result = '';
  spinning = true;
  for (let i = 0; i < 3; i++) {
    let speed = 32;
    let spinSpeeds = [];
    for (let s = 0; s < 20 + i * 5 + int(random(5)); s++) {
      spinSpeeds.push(speed);
      if (s % 3 === 0 && speed > 4) speed -= 2;
    }
    reels[i].spinSpeeds = spinSpeeds;
    reels[i].y = 0;
    reels[i].offset = 0;
  }
}

function getSequenceFromSeed(seed) {
  let sequence = [];
  let used = Array(totalImages).fill(false);
  for (let i = 0; i < totalImages; i++) {
    let idx = Number((BigInt(seed) >> BigInt(i * 16)) % BigInt(totalImages));
    while (used[idx]) idx = (idx + 1) % totalImages;
    sequence.push(idx);
    used[idx] = true;
  }
  return sequence;
}

function setReelSequences(baseSequence) {
  for (let i = 0; i < 3; i++) {
    reels[i] = {
      offset: 0,
      y: 0,
      spinSequence: shuffle([...baseSequence]),
      spinSpeeds: []
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
    scoreBreakdown.push({ imgIndex: imgIdx, base: 10000, multiplier, total: 10000 * multiplier, count: 3 });
    result = `🎉 Triple Match! +${10000 * multiplier}`;
  } else if (maxCount === 2) {
    const repeated = keys.find(k => counts[k] === 2);
    const remaining = keys.find(k => counts[k] === 1);
    addedScore += 1000;
    if (specialMultipliers[repeated]) multiplier = specialMultipliers[repeated];
    scoreBreakdown.push({ imgIndex: repeated, base: 1000, multiplier, total: 1000 * multiplier, count: 2 });

    if ([5, 6, 7, 8].includes(remaining)) {
      const bonus = (remaining - 5 + 1) * 100;
      scoreBreakdown.push({ imgIndex: remaining, base: bonus, multiplier: 1, total: bonus, count: 1 });
      addedScore += bonus;
    }

    result = `✨ Double Match! +${scoreBreakdown.reduce((sum, s) => sum + s.total, 0)}`;
  } else {
    [a, b, c].forEach(idx => {
      if (idx >= 5 && idx <= 8) {
        const base = (idx - 5 + 1) * 100;
        scoreBreakdown.push({ imgIndex: idx, base, multiplier: 1, total: base, count: 1 });
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
    walletDisplay.html("");
    return;
  }

  const metamask = getMetamaskProvider();
  if (metamask) {
    try {
      const accounts = await metamask.request({ method: "eth_requestAccounts" });
      walletAddress = accounts[0]; // ENS 불필요한 방식
      provider = new ethers.BrowserProvider(metamask);
      signer = await provider.getSigner();
      isConnected = true;
      const displayAddr = `${walletAddress.slice(0, 6)}....${walletAddress.slice(-4)}`;
      walletDisplay.html(displayAddr);
      connectButton.html("🔓 Disconnect");
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

async function claimFreeSpins() {
  const contractAddress = "0xYourContractAddress";
  const abi = ["function claimFreeSpins()", "event FreeSeedsGranted(address indexed player, uint256[10])"];
  const contract = new ethers.Contract(contractAddress, abi, signer);
  try {
    const tx = await contract.claimFreeSpins();
    const receipt = await tx.wait();
    const log = receipt.logs.find(log => log.topics[0] === contract.interface.getEventTopic("FreeSeedsGranted"));
    const decoded = contract.interface.decodeEventLog("FreeSeedsGranted", log.data, log.topics);
    freeSeeds = decoded.seeds.map(s => s.toString());
    currentSeedIndex = -1;
  } catch (err) {
    alert("❌ Failed to claim: " + err.message);
  }
}

async function buyPlays(plays, amountETH) {
  const contractAddress = "0xYourContractAddress";
  const abi = ["function buyPlays(uint256 count) payable"];
  const contract = new ethers.Contract(contractAddress, abi, signer);
  try {
    const tx = await contract.buyPlays(plays, {
      value: ethers.parseEther(amountETH)
    });
    await tx.wait();
    playCredits += plays;
  } catch (err) {
    alert("❌ Purchase failed: " + err.message);
  }
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
