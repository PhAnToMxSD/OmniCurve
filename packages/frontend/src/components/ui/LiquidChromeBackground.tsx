import { useEffect, useRef } from 'react'

interface Props {
  isDark: boolean
}

export default function LiquidChromeBackground({ isDark }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const targetDark = useRef(isDark ? 1.0 : 0.0)

  // Update target without restarting the render loop
  useEffect(() => {
    targetDark.current = isDark ? 1.0 : 0.0
  }, [isDark])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const mouse = { tx: 0.5, ty: 0.5, x: 0.5, y: 0.5 }

    const onMove = (e: MouseEvent) => {
      mouse.tx = e.clientX / window.innerWidth
      mouse.ty = 1.0 - e.clientY / window.innerHeight
    }
    window.addEventListener('mousemove', onMove)

    const gl = canvas.getContext('webgl')
    if (!gl) {
      window.removeEventListener('mousemove', onMove)
      return
    }

    // ── Shaders ────────────────────────────────────────────────────────────────

    const vert = `
      attribute vec4 aPos;
      void main() { gl_Position = aPos; }
    `

    const frag = `
      precision highp float;
      uniform vec2  uRes;
      uniform float uTime;
      uniform vec2  uMouse;
      uniform float uDark;   /* 0=light  1=dark, smoothly interpolated */

      /* ── Value noise with quintic interpolation (no grid artefacts) ──────── */
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float qnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        /* Quintic — smoother than cubic, removes derivative seams */
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(
          mix(hash(i),              hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0, 1)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      /* ── Color palettes ───────────────────────────────────────────────────── */

      /* Dark: near-black → very subtle deep maroon — stays almost black */
      vec3 darkPal(float t) {
        vec3 col = mix(vec3(0.012, 0.000, 0.000), vec3(0.060, 0.003, 0.008),
                       smoothstep(0.00, 0.30, t));
        col = mix(col, vec3(0.110, 0.007, 0.020), smoothstep(0.25, 0.55, t));
        col = mix(col, vec3(0.150, 0.010, 0.030), smoothstep(0.50, 0.72, t));
        col = mix(col, vec3(0.170, 0.012, 0.035), smoothstep(0.68, 0.88, t));
        col = mix(col, vec3(0.180, 0.013, 0.038), smoothstep(0.84, 1.00, t));
        return col;
      }

      /* Light: ivory → blush → crimson → deep maroon */
      vec3 lightPal(float t) {
        vec3 col = mix(vec3(0.998, 0.966, 0.960), vec3(0.960, 0.860, 0.845),
                       smoothstep(0.00, 0.28, t));
        col = mix(col, vec3(0.880, 0.600, 0.580), smoothstep(0.22, 0.50, t));
        col = mix(col, vec3(0.769, 0.071, 0.188), smoothstep(0.46, 0.70, t));
        col = mix(col, vec3(0.340, 0.018, 0.050), smoothstep(0.66, 0.86, t));
        col = mix(col, vec3(0.080, 0.002, 0.010), smoothstep(0.84, 1.00, t));
        return col;
      }

      /* ── Main ────────────────────────────────────────────────────────────── */
      void main() {
        vec2 uv = gl_FragCoord.xy / uRes;
        uv.y    = 1.0 - uv.y;

        float ar = uRes.x / uRes.y;

        /* Very slow, passive drift */
        vec2 drift = vec2(uTime * 0.010, uTime * 0.007);

        /* Mouse: smooth Gaussian pull — noise pattern follows cursor */
        vec2  toMouse = uv - uMouse;
        float md2     = dot(toMouse, toMouse);
        float push    = exp(-md2 * 10.0) * 0.05;
        vec2  pushDir = normalize(toMouse + 0.0001);
        /* Invert direction: sample toward cursor, so pattern follows it */
        vec2 pp = uv - pushDir * push;
        pp *= vec2(ar, 1.0);

        /* ── Two-octave large-blob noise — the misty chrome texture ───────── */
        /*
         *  We deliberately avoid fBm / domain-warping here.
         *  Two coarse, offset noise samples blended together produce the exact
         *  large soft-blob structure seen in the reference: huge, smooth regions
         *  of light and dark with no visible period or grid artefacts.
         */

        /* Base layer — very coarse, shapes the large regions */
        float f1 = qnoise((pp + drift)               * 0.52);
        float f2 = qnoise((pp + drift + vec2(3.71, 7.43)) * 0.52);

        /* Overlay layer — somewhat finer, adds internal sculpting */
        float f3 = qnoise((pp + drift * 1.35 + vec2(9.13, 2.87)) * 0.88);
        float f4 = qnoise((pp + drift * 1.10 + vec2(5.51, 11.2)) * 0.88);

        /* Weighted blend — overlay controlled by the base shape */
        float base    = mix(f1, f2, 0.42);
        float overlay = mix(f3, f4, 0.38);
        float field   = mix(base, overlay, 0.34);

        /* S-curve: compress the extremes, lift the mids — matches the
           compressed tonal range in the reference image */
        float t = smoothstep(0.18, 0.82, field);

        /* Faint specular glint at peaks — the "chrome" quality */
        float glint = exp(-pow((field - 0.79) * 8.5, 2.0)) * 0.13;
        t = clamp(t + glint, 0.0, 1.0);

        /* Color */
        vec3 col = mix(lightPal(t), darkPal(t), uDark);

        /* Cursor glow — very subtle */
        float mDist = sqrt(md2);
        float glow  = exp(-mDist * 7.5) * 0.08;
        vec3  glowD = vec3(0.950, 0.340, 0.310) * glow;
        vec3  glowL = vec3(0.769, 0.071, 0.188) * glow;
        col = clamp(col + mix(glowL, glowD, uDark), 0.0, 1.0);

        /* Very subtle vignette — draws focus inward */
        float vign = smoothstep(0.82, 0.22, length(uv - 0.5));
        col *= mix(0.91 + 0.09 * vign, 0.93 + 0.07 * vign, uDark);

        gl_FragColor = vec4(col, 1.0);
      }
    `

    // ── Compile & link ─────────────────────────────────────────────────────────

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader error:', gl.getShaderInfoLog(s))
        gl.deleteShader(s)
        return null
      }
      return s
    }

    const vs = compile(gl.VERTEX_SHADER, vert)
    const fs = compile(gl.FRAGMENT_SHADER, frag)
    if (!vs || !fs) return

    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Link error:', gl.getProgramInfoLog(prog))
      return
    }

    // Full-screen quad
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    )

    const aPosLoc  = gl.getAttribLocation(prog, 'aPos')
    const uResLoc  = gl.getUniformLocation(prog, 'uRes')
    const uTimeLoc = gl.getUniformLocation(prog, 'uTime')
    const uMouseLoc= gl.getUniformLocation(prog, 'uMouse')
    const uDarkLoc = gl.getUniformLocation(prog, 'uDark')

    const resize = () => {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    window.addEventListener('resize', resize)
    resize()

    // ── Render loop ────────────────────────────────────────────────────────────

    let animId: number
    const t0 = performance.now()
    let darkLerp = targetDark.current

    const render = () => {
      const elapsed = (performance.now() - t0) / 1000

      // Very slow mouse tracking — barely perceptible
      mouse.x += (mouse.tx - mouse.x) * 0.008
      mouse.y += (mouse.ty - mouse.y) * 0.008

      // Smooth theme transition (~0.5 s)
      darkLerp += (targetDark.current - darkLerp) * 0.045

      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(prog)
      gl.uniform2f(uResLoc,   canvas.width, canvas.height)
      gl.uniform1f(uTimeLoc,  elapsed)
      gl.uniform2f(uMouseLoc, mouse.x, mouse.y)
      gl.uniform1f(uDarkLoc,  darkLerp)

      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aPosLoc)

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      animId = requestAnimationFrame(render)
    }
    render()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // compiled once; theme transitions are handled by darkLerp in the render loop

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: -10,
        pointerEvents: 'none',
      }}
    />
  )
}
