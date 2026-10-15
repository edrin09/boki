const modPath = process.argv[2]
const dir = process.argv[3]
const t0 = Date.now()
const ort = require(modPath)
console.log('require onnxruntime-node ms:', Date.now() - t0)
const t1 = Date.now()
Promise.all([
  ort.InferenceSession.create(dir + '\\det.onnx'),
  ort.InferenceSession.create(dir + '\\cls.onnx'),
  ort.InferenceSession.create(dir + '\\rec.onnx'),
])
  .then(() => console.log('create 3 sessions ms:', Date.now() - t1, '| total ms:', Date.now() - t0))
  .catch((e) => console.log('session error:', e && e.message))