export type FilmRenderOptions = {
  dateStamp?: boolean;
  colorFlash?: boolean;
};

const vertexShader = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

const fragmentShader = `
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_seed;
uniform float u_flash;
varying vec2 v_texCoord;

float random(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233)) + u_seed) * 43758.5453);
}

void main() {
  vec2 uv = v_texCoord;
  vec2 aberration = (uv - vec2(0.5)) * (0.00115 + u_flash * 0.00065);
  float red = texture2D(u_image, clamp(uv + aberration, 0.0, 1.0)).r;
  float blue = texture2D(u_image, clamp(uv - aberration, 0.0, 1.0)).b;
  vec3 color = vec3(red, texture2D(u_image, uv).g, blue);

  color = (color - 0.5) * 1.12 + 0.5;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(luma), color, 0.90);

  float shadowMask = 1.0 - smoothstep(0.05, 0.52, luma);
  color = mix(color, vec3(0.23, 0.34, 0.32), shadowMask * 0.16);
  float highlightMask = smoothstep(0.28, 0.90, luma);
  color = mix(color, color * vec3(1.11, 0.985, 0.83) + vec3(0.018, 0.005, -0.012), highlightMask);

  float flashDistance = length((uv - vec2(0.46, 0.39)) * vec2(1.0, 1.22));
  float flashBloom = smoothstep(0.76, 0.0, flashDistance);
  color += vec3(0.10, 0.058, 0.018) * flashBloom;
  color += vec3(0.17, 0.082, 0.024) * flashBloom * u_flash;

  float grain = random(uv * u_resolution + u_seed) - 0.5;
  color += grain * (0.115 + u_flash * 0.025);

  float distanceToCenter = length((uv - vec2(0.5)) * vec2(0.92, 1.08));
  float vignette = smoothstep(0.82, 0.22, distanceToCenter);
  color *= mix(0.54, 1.0, vignette);

  float scratchX = random(vec2(floor(uv.x * 240.0), u_seed));
  float scratch = step(0.997, scratchX) * smoothstep(0.18, 0.56, random(vec2(uv.y, u_seed)));
  color += scratch * vec3(0.14, 0.09, 0.045);
  color = pow(max(color, 0.0), vec3(0.96));

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Не удалось создать шейдер.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Ошибка компиляции шейдера.");
  }
  return shader;
}

async function loadImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Не удалось подготовить кадр."))),
      "image/jpeg",
      0.9,
    );
  });
}

async function finishFrame(canvas: HTMLCanvasElement, options: FilmRenderOptions) {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  const context = output.getContext("2d");
  if (!context) return canvasToBlob(canvas);
  context.drawImage(canvas, 0, 0);

  context.save();
  context.globalCompositeOperation = "screen";
  const baseBloom = context.createRadialGradient(
    output.width * 0.46,
    output.height * 0.39,
    output.width * 0.03,
    output.width * 0.46,
    output.height * 0.39,
    output.width * 0.72,
  );
  baseBloom.addColorStop(0, "rgba(255, 215, 156, .10)");
  baseBloom.addColorStop(0.48, "rgba(255, 133, 76, .035)");
  baseBloom.addColorStop(1, "rgba(255, 95, 50, 0)");
  context.fillStyle = baseBloom;
  context.fillRect(0, 0, output.width, output.height);
  context.restore();

  if (options.colorFlash) {
    context.save();
    context.globalCompositeOperation = "screen";
    const glow = context.createRadialGradient(
      output.width * 0.48,
      output.height * 0.46,
      output.width * 0.04,
      output.width * 0.48,
      output.height * 0.46,
      output.width * 0.72,
    );
    glow.addColorStop(0, "rgba(255, 236, 205, .34)");
    glow.addColorStop(0.45, "rgba(255, 142, 94, .12)");
    glow.addColorStop(1, "rgba(255, 95, 50, 0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, output.width, output.height);
    context.restore();
  }

  if (options.dateStamp) {
    const date = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date()).replaceAll("/", " ");
    const fontSize = Math.max(20, Math.round(output.width * 0.027));
    context.save();
    context.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.shadowColor = "rgba(92, 30, 0, .7)";
    context.shadowBlur = Math.max(2, Math.round(fontSize * 0.12));
    context.fillStyle = "#ff9b55";
    context.fillText(date, output.width * 0.94, output.height * 0.94);
    context.restore();
  }

  return canvasToBlob(output);
}

async function canvasFallback(
  image: HTMLImageElement,
  width: number,
  height: number,
  options: FilmRenderOptions,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Обработка изображений недоступна.");
  context.filter = "contrast(1.12) saturate(.9) sepia(.18) hue-rotate(-4deg)";
  context.drawImage(image, 0, 0, width, height);
  return finishFrame(canvas, options);
}

export async function applyFilmEffect(
  file: File,
  options: FilmRenderOptions = {},
) {
  const image = await loadImage(file);
  const maxSide = 2400;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (!gl) return canvasFallback(image, width, height, options);

  const program = gl.createProgram();
  if (!program) throw new Error("WebGL недоступен.");
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vertexShader));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentShader));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Ошибка запуска шейдера.");
  }
  gl.useProgram(program);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]), gl.STATIC_DRAW);
  const texCoord = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texCoord);
  gl.vertexAttribPointer(texCoord, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
  gl.uniform1f(gl.getUniformLocation(program, "u_seed"), Math.random() * 1000);
  gl.uniform1f(gl.getUniformLocation(program, "u_flash"), options.colorFlash ? 1 : 0);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  return finishFrame(canvas, options);
}
