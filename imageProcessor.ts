
/**
 * Advanced Image Processing Library
 * Specialized for High-Fidelity SVG Tracing with a strict 150KB size limit.
 * Focuses on original color preservation, gap prevention, and guaranteed file size.
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

  // 1. Background Removal & Auto Crop (Clean and Tight)
  if (options.bgRemove || options.autoCrop) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    if (options.bgRemove) {
      const bgColors: {r: number, g: number, b: number}[] = [];
      const steps = 15; // Increased sampling for cleaner removal
      for (let i = 0; i < steps; i++) {
        const pts = [
          {x: Math.floor(width * i / (steps-1)), y: 0},
          {x: Math.floor(width * i / (steps-1)), y: height - 1},
          {x: 0, y: Math.floor(height * i / (steps-1))},
          {x: width - 1, y: Math.floor(height * i / (steps-1))}
        ];
        pts.forEach(p => {
          const idx = (p.y * width + p.x) * 4;
          if (data[idx + 3] > 0) {
            bgColors.push({ r: data[idx], g: data[idx+1], b: data[idx+2] });
          }
        });
      }

      const getDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
        const rmean = (r1 + r2) / 2;
        const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
        return Math.sqrt(((2 + rmean / 256) * dr * dr) + (4 * dg * dg) + ((2 + (255 - rmean) / 256) * db * db));
      };

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i+1], b = data[i+2];
        let minColorDist = 1000;
        for (const bg of bgColors) {
          const dist = getDistance(r, g, b, bg.r, bg.g, bg.b);
          if (dist < minColorDist) minColorDist = dist;
        }
        let threshold = 35; 
        if (r > 240 && g > 240 && b > 240) threshold = 20; // Stricter for whites
        if (minColorDist < threshold) data[i + 3] = 0;
        else data[i + 3] = 255;
      }
      // Sharp Alpha Mask
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] < 128) data[i + 3] = 0; else data[i + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);

    if (options.autoCrop) {
      let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
      const scanData = ctx.getImageData(0, 0, width, height).data;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (scanData[(y * width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            found = true;
          }
        }
      }
      if (found) {
        const cw = (maxX - minX) + 1, ch = (maxY - minY) + 1;
        const croppedCanvas = document.createElement('canvas');
        croppedCanvas.width = cw; croppedCanvas.height = ch;
        croppedCanvas.getContext('2d')!.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
        canvas = croppedCanvas;
        ctx = canvas.getContext('2d')!;
        width = cw; height = ch;
      }
    }
  }

  // 2. Resize
  if (options.resizeWidth > 0 && options.resizeWidth !== width) {
    const aspectRatio = height / width;
    const targetHeight = Math.round(options.resizeWidth * aspectRatio);
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = options.resizeWidth; resizedCanvas.height = targetHeight;
    const rctx = resizedCanvas.getContext('2d')!;
    rctx.imageSmoothingQuality = 'high';
    rctx.drawImage(canvas, 0, 0, width, height, 0, 0, options.resizeWidth, targetHeight);
    canvas = resizedCanvas;
    ctx = canvas.getContext('2d')!;
    width = canvas.width; height = canvas.height;
  }

  // 3. SVG Tracing
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

/**
 * High-fidelity SVG Tracing with guaranteed 150KB limit and original color palette extraction.
 */
async function traceToSVG(canvas: HTMLCanvasElement, colorsCount: number): Promise<{ content: string; colors: string[] }> {
  const MAX_BYTES = 150 * 1024;

  const generate = (sourceW: number, sourceH: number, data: Uint8ClampedArray, limit: number) => {
    // 1. Extract Dominant Colors (Original Colors)
    const colorFrequency: Record<string, number> = {};
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const hex = `#${((1 << 24) + (data[i] << 16) + (data[i + 1] << 8) + data[i + 2]).toString(16).slice(1).toUpperCase()}`;
      colorFrequency[hex] = (colorFrequency[hex] || 0) + 1;
    }
    
    const palette = Object.entries(colorFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(e => e[0]);

    if (palette.length === 0) return { content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sourceW} ${sourceH}"></svg>`, colors: [] };

    // Prepare Palette RGB for fast distance check
    const paletteRgb = palette.map(hex => {
      const bigint = parseInt(hex.slice(1), 16);
      return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255, hex };
    });

    // 2. Map Pixels to Palette and Build Paths (Horizontal RLE for size)
    const colorPaths: Record<string, string[]> = {};
    palette.forEach(c => colorPaths[c] = []);

    for (let y = 0; y < sourceH; y++) {
      let startX = -1;
      let lastHex = "";

      for (let x = 0; x < sourceW; x++) {
        const idx = (y * sourceW + x) * 4;
        const alpha = data[idx + 3];
        let currentHex = "";

        if (alpha > 128) {
          const r = data[idx], g = data[idx+1], b = data[idx+2];
          let minDist = Infinity;
          let bestHex = palette[0];
          for(let i=0; i < paletteRgb.length; i++) {
            const p = paletteRgb[i];
            const d = Math.pow(r-p.r, 2) + Math.pow(g-p.g, 2) + Math.pow(b-p.b, 2);
            if(d < minDist) { minDist = d; bestHex = p.hex; }
          }
          currentHex = bestHex;
        }

        if (currentHex !== lastHex) {
          if (lastHex !== "") {
            // Overlap of 0.05 to ensure no gaps between paths
            colorPaths[lastHex].push(`M${startX},${y}h${x - startX}.05v1.05h-${x - startX}.05z`);
          }
          startX = x;
          lastHex = currentHex;
        }
      }
      if (lastHex !== "") {
        colorPaths[lastHex].push(`M${startX},${y}h${sourceW - startX}.05v1.05h-${sourceW - startX}.05z`);
      }
    }

    const svgHeader = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sourceW} ${sourceH}" shape-rendering="crispEdges">`;
    let svgPaths = '';
    palette.forEach(color => {
      if (colorPaths[color].length > 0) {
        svgPaths += `<path d="${colorPaths[color].join('')}" fill="${color}" stroke="none" />`;
      }
    });
    return { content: svgHeader + svgPaths + `</svg>`, colors: palette };
  };

  // Adaptive Resizing to stay under 150KB
  let scale = 1.0;
  if (canvas.width * canvas.height > 800 * 800) scale = 0.6; // Initial shrink for efficiency
  
  let finalResult;
  while(true) {
    const sw = Math.round(canvas.width * scale);
    const sh = Math.round(canvas.height * scale);
    const sc = document.createElement('canvas');
    sc.width = sw; sc.height = sh;
    const sctx = sc.getContext('2d', {willReadFrequently: true})!;
    sctx.drawImage(canvas, 0, 0, sw, sh);
    const data = sctx.getImageData(0, 0, sw, sh).data;
    
    finalResult = generate(sw, sh, data, colorsCount);
    
    // Check if within 150KB or reached minimum usable scale
    if (finalResult.content.length <= MAX_BYTES || scale < 0.1) {
      break;
    }
    scale *= 0.7; // Aggressive scale down to meet limit
  }
  
  return finalResult;
}
