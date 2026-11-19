const pet = document.getElementById('pet');
const IDLE_SRC = './assets/idle.png';
const reactions = [
  { key: 'smile', src: './assets/smile.png' },
  { key: 'cold', src: './assets/cold.png' },
];

let resetTimer;
let isPointerDown = false;
let isDragging = false;
let startScreenX = 0;
let startScreenY = 0;
let ignoreClick = false;

function playNodAnimation() {
  pet.classList.remove('nod');
  void pet.offsetWidth;
  pet.classList.add('nod');
}

async function sendAlphaMask(key, fileName) {
  const bytes = await window.petWindow.getAssetBytes(fileName);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const { width, height } = bitmap;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);

  const { data } = context.getImageData(0, 0, width, height);
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) {
    alpha[i] = data[i * 4 + 3];
  }

  bitmap.close();

  // 交给主进程做光标命中判定，透明区域穿透、人物区域可交互
  window.petWindow.sendAlphaMask(key, width, height, alpha);
}

Promise.all([
  sendAlphaMask('idle', 'idle.png'),
  sendAlphaMask('smile', 'smile.png'),
  sendAlphaMask('cold', 'cold.png'),
]).catch((error) => {
  console.error('读取图片透明区域失败：', error);
});

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  isPointerDown = true;
  isDragging = false;
  ignoreClick = false;
  startScreenX = event.screenX;
  startScreenY = event.screenY;

  pet.setPointerCapture(event.pointerId);
  window.petWindow.startDrag();
});

pet.addEventListener('pointermove', (event) => {
  if (!isPointerDown) return;

  if (!isDragging) {
    const distance = Math.hypot(
      event.screenX - startScreenX,
      event.screenY - startScreenY,
    );
    if (distance < 4) return;
    isDragging = true;
  }

  window.petWindow.moveDrag();
});

pet.addEventListener('pointerup', (event) => {
  if (event.button !== 0) return;

  isPointerDown = false;
  ignoreClick = isDragging;
  isDragging = false;
  window.petWindow.endDrag();

  if (pet.hasPointerCapture(event.pointerId)) {
    pet.releasePointerCapture(event.pointerId);
  }
});

pet.addEventListener('pointercancel', () => {
  isPointerDown = false;
  isDragging = false;
  window.petWindow.endDrag();
});

pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petWindow.showMenu();
});

pet.addEventListener('click', () => {
  if (ignoreClick) {
    ignoreClick = false;
    return;
  }

  clearTimeout(resetTimer);

  const reaction = reactions[Math.floor(Math.random() * reactions.length)];
  pet.src = reaction.src;
  window.petWindow.setImageKey(reaction.key);
  playNodAnimation();

  resetTimer = setTimeout(() => {
    pet.src = IDLE_SRC;
    window.petWindow.setImageKey('idle');
  }, 800);
});

pet.addEventListener('animationend', () => {
  pet.classList.remove('nod');
});
