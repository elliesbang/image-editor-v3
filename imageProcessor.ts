
/**
 * Advanced Image Processing Library
 * Specialized for High-Fidelity SVG Tracing with Subject Protection.
 */

export async function processImage(
  dataUrl: string,
  options: { 
    bgRemove: boolean; 
    autoCrop: boolean; 
    format: string; 
    svgColors: number;
    resizeWidth: number;
    noiseLevel: number;
  }
): Promise<{ processedUrl: string; width: number; height: number; svgContent?: string; svgColorsList?: string[] }> {
  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("이미지 로드 실패"));
  });

  let canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context missing");

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  let width = canvas.width;
  let height = canvas.height;

  // 1. Background Removal (Subject Protection Logic)
  if (options.bgRemove) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // 샘플링 영역: 모서리와 테두리 위주로 배경색 추정
    const bgColors: {r: number, g: number, b: number}[] = [];
    const inset = 2; // 가장자리에서 약간 안쪽
    const samples = [
      {x: inset, y: inset}, {x: width - inset, y: inset},
      {x: inset, y: height - inset}, {x: width - inset, y: height - inset},
      {x: Math.floor(width/2), y: inset}, {x: Math.floor(width/2), y: height - inset},
      {x: inset, y: Math.floor(height/2)}, {x: width - inset, y: Math.floor(height/2)}
    ];

    samples.forEach(p => {
      const idx = (p.y * width + p.x) * 4;
      bgColors.push({ r: data[idx], g: data[idx+1], b: data[idx+2] });
    });

    const getDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
      return Math.sqrt(Math.pow(r1-r2, 2) + Math.pow(g1-g2, 2) + Math.pow(b1-b2, 2));
    };

    const centerX = width / 2;
    const centerY = height / 2;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    for (let i = 0; i < data.length; i += 4) {
      const x = (i / 4) % width;
      const y = Math.floor((i / 4) / width);
      const r = data[i], g = data[i+1], b = data[i+2];
      
      let minColorDist = 1000;
      bgColors.forEach(bg => {
        const d = getDistance(r, g, b, bg.r, bg.g, bg.b);
        if (d < minColorDist) minColorDist = d;
      });

      // 피사체 보호 로직: 중심부에 가까울수록, 색상 거리가 일정 이상이면 배경으로 간주하지 않음
      const distFromCenter = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      const centerFactor = distFromCenter / maxDist; // 0 (중심) ~ 1 (가장자리)
      
      let threshold = 40 * (0.5 + centerFactor * 0.5); // 가장자리는 관대하게, 중심은 엄격하게
      
      if (minColorDist < threshold) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // 2. Auto Crop (Subject Tight Logic)
  if (options.autoCrop) {
    const scanData = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (scanData[(y * width + x) * 4 + 3] > 10) { // 어느정도 불투명한 픽셀만 체크
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          found = true;
        }
      }
    }
    if (found) {
      const cw = (maxX - minX) + 1;
      const ch = (maxY - minY) + 1;
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cw; croppedCanvas.height = ch;
      const cctx = croppedCanvas.getContext('2d')!;
      cctx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
      canvas = croppedCanvas;
      ctx = cctx;
      width = cw; height = ch;
    }
  }

  // 3. Resize
  if (options.resizeWidth > 0 && options.resizeWidth !== width) {
    const aspectRatio = height / width;
    const targetHeight = Math.round(options.resizeWidth * aspectRatio);
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = options.resizeWidth; resizedCanvas.height = targetHeight;
    const rctx = resizedCanvas.getContext('2d')!;
    rctx.imageSmoothingEnabled = true;
    rctx.imageSmoothingQuality = 'high';
    rctx.drawImage(canvas, 0, 0, width, height, 0, 0, options.resizeWidth, targetHeight);
    canvas = resizedCanvas;
    ctx = canvas.getContext('2d')!;
    width = canvas.width; height = canvas.height;
  }

  // 4. SVG Tracing (150KB Limit + Transparent + No Stroke)
  let svgContent: string | undefined;
  let svgColorsList: string[] | undefined;
  if (options.format === 'svg') {
    const trace = await traceToSVG(canvas, options.svgColors);
    svgContent = trace.content;
    svgColorsList = trace.colors;
  }

  const finalUrl = canvas.toDataURL(`image/png`);

  return {
    processedUrl: finalUrl,
    width,
    height,
    svgContent,
    svgColorsList
  };
}

async function traceToSVG(canvas: HTMLCanvasElement, colorsCount: number): Promise<{ content: string; colors: string[] }> {
  const MAX_BYTES = 150 * 1024;
  let scale = 1.0;
  
  const performTrace = (w: number, h: number, data: Uint8ClampedArray, limit: number) => {
    const colorFreq: Record<string, number> = {};
    for (let i = 0; i < data.length; i += 4) {
      if (data[i+3] < 128) continue;
      const hex = `#${((1 << 24) + (data[i] << 16) + (data[i+1] << 8) + data[i+2]).toString(16).slice(1).toUpperCase()}`;
      colorFreq[hex] = (colorFreq[hex] || 0) + 1;
    }

    const palette = Object.entries(colorFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(e => e[0]);

    if (palette.length === 0) return { content: '', colors: [] };

    const rgbPalette = palette.map(hex => {
      const b = parseInt(hex.slice(1), 16);
      return { r: (b >> 16) & 255, g: (b >> 8) & 255, b: b & 255, hex };
    });

    const paths: Record<string, string[]> = {};
    palette.forEach(c => paths[c] = []);

    for (let y = 0; y < h; y++) {
      let startX = -1;
      let lastHex = "";
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        let currentHex = "";
        if (data[idx+3] > 128) {
          let minD = Infinity;
          rgbPalette.forEach(p => {
            const d = Math.pow(data[idx]-p.r, 2) + Math.pow(data[idx+1]-p.g, 2) + Math.pow(data[idx+2]-p.b, 2);
            if (d < minD) { minD = d; currentHex = p.hex; }
          });
        }

        if (currentHex !== lastHex) {
          if (lastHex !== "") paths[lastHex].push(`M${startX},${y}h${x-startX}v1h-${x-startX}z`);
          startX = x; lastHex = currentHex;
        }
      }
      if (lastHex !== "") paths[lastHex].push(`M${startX},${y}h${w-startX}v1h-${w-startX}z`);
    }

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`;
    palette.forEach(c => {
      if (paths[c].length > 0) {
        svg += `<path d="${paths[c].join('')}" fill="${c}" stroke="none" />`;
      }
    });
    svg += `</svg>`;
    return { content: svg, colors: palette };
  };

  let result = { content: '', colors: [] as string[] };
  while(scale > 0.1) {
    const sw = Math.round(canvas.width * scale);
    const sh = Math.round(canvas.height * scale);
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw; tempCanvas.height = sh;
    const tctx = tempCanvas.getContext('2d')!;
    tctx.drawImage(canvas, 0, 0, sw, sh);
    const data = tctx.getImageData(0, 0, sw, sh).data;
    result = performTrace(sw, sh, data, colorsCount);
    if (result.content.length < MAX_BYTES) break;
    scale *= 0.8;
  }
  return result;
}
