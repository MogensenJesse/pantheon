// src/rendering/shaders/volumetricClouds.ts — raymarched cloud shell (WebGL2/GLSL1)

export const volumetricCloudVertex = /* glsl */`
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;
  }
`;

export const volumetricCloudFragment = /* glsl */`
  precision highp float;

  varying vec3 vWorldPosition;

  uniform vec3 sunDirection;
  uniform vec3 uCloudCameraPos;
  uniform float time;
  uniform float daylight;
  uniform float cloudCoverage;

  const int STEPS = 20;
  const float innerRadius = 320.0;
  const float outerRadius = 380.0;

  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);
    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);
    return mix(nxy0, nxy1, f.z);
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.02;
      a *= 0.5;
    }
    return v;
  }

  float cloudDensity(vec3 p) {
    float wind = time * 0.012;
    vec3 q = p * 0.004 + vec3(wind, wind * 0.3, wind * 0.6);
    float n = fbm(q);
    float shape = smoothstep(cloudCoverage, cloudCoverage + 0.28, n);
    float height = length(p);
    float heightMask = smoothstep(innerRadius, innerRadius + 40.0, height);
    heightMask *= 1.0 - smoothstep(outerRadius - 30.0, outerRadius, height);
    return shape * heightMask;
  }

  vec2 raySphere(vec3 ro, vec3 rd, float radius) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - radius * radius;
    float h = b * b - c;
    if (h < 0.0) return vec2(-1.0);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  void main() {
    vec3 ro = uCloudCameraPos;
    vec3 rd = normalize(vWorldPosition - ro);

    vec2 hitOuter = raySphere(ro, rd, outerRadius);
    if (hitOuter.x < 0.0) discard;

    float tStart = max(0.0, hitOuter.x);
    float tEnd = hitOuter.y;

    vec2 hitInner = raySphere(ro, rd, innerRadius);
    if (hitInner.x > 0.0) {
      tEnd = min(tEnd, hitInner.x);
    }

    if (tEnd <= tStart) discard;

    vec3 sunDir = normalize(sunDirection);
    vec3 cloudColor = vec3(0.0);
    float transmittance = 1.0;
    float stepLen = (tEnd - tStart) / float(STEPS);

    for (int i = 0; i < STEPS; i++) {
      float t = tStart + (float(i) + 0.5) * stepLen;
      vec3 pos = ro + rd * t;
      float density = cloudDensity(pos);
      if (density > 0.001) {
        float lightSample = 0.0;
        vec3 lp = pos + sunDir * 8.0;
        for (int j = 0; j < 3; j++) {
          lp += sunDir * 6.0;
          lightSample += cloudDensity(lp);
        }
        float light = exp(-lightSample * 1.4);
        float phase = 0.6 + 0.4 * pow(max(dot(rd, sunDir), 0.0), 3.0);
        vec3 scatter = mix(vec3(0.55, 0.58, 0.62), vec3(1.0, 0.97, 0.9), light) * phase;
        float absorbed = 1.0 - exp(-density * stepLen * 2.2);
        cloudColor += transmittance * absorbed * scatter * daylight;
        transmittance *= 1.0 - absorbed;
        if (transmittance < 0.02) break;
      }
    }

    float alpha = (1.0 - transmittance) * daylight;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(cloudColor, alpha);
  }
`;
