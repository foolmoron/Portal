// Util
TAU = Math.PI * 2
function debounce(func, time, context) {
    var timeoutId
    return function() {
        clearTimeout(timeoutId)
        var args = arguments
        timeoutId = setTimeout(function() { func.apply(context, args) }, time)
    }
}
function throttleBounce(func, interval, context) {
    var firedThisInterval = false
    var timeoutId = null
    return function() { // use explicit function syntax to get wrapped arguments context
        if (!firedThisInterval) {
            // throttle
            func.apply(context, arguments)
            firedThisInterval = true
            setTimeout(() => { firedThisInterval = false }, interval)
        } else {
            // debounce
            clearTimeout(timeoutId)
            timeoutId = setTimeout(() => { func.apply(context, arguments) }, interval)
        }
    }
}

// Misc global
var gui
var isFullscreen
var uiZoomed

var extra = {
    fullscreen: function() {
        // fullscreen canvas
        var canvas = document.getElementById('canvas')
        var requestFullScreen = canvas.requestFullScreen || canvas.webkitRequestFullscreen || canvas.mozRequestFullScreen || canvas.msRequestFullscreen
        if (requestFullScreen) {
            requestFullScreen.call(canvas)
        }
    },
    zoomUI: function() {
        uiZoomed = !uiZoomed
        initGUI()
    },
    source: function() {
        window.open('https://github.com/foolmoron/portal', '_blank')
    },
}

document.onfullscreenchange = document.onwebkitfullscreenchange = document.onmozfullscreenchange = document.onmsfullscreenchange = function(e) {
    var prevFullscreen = isFullscreen
    isFullscreen = document.fullscreen || document.webkitIsFullScreen || document.mozFullScreen
    if (!prevFullscreen && isFullscreen) {
        // destroy dat.gui in full screen for performance
        gui.destroy()
    } else if (prevFullscreen && !isFullscreen) {
        // rebuild dat.gui when exiting full screen
        initGUI()
    }
}

// Renderer setup
var renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('canvas') })
renderer.setPixelRatio(window.devicePixelRatio)

var camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 1, 1000)
var clock = new THREE.Clock()
var deviceOrientation = new THREE.DeviceOrientationControls(camera) // from https://threejs.org/examples/misc_controls_deviceorientation.html

var w, h
var handleResize = function() {
    w = window.innerWidth
    h = window.innerHeight
    renderer.setSize(w, h)
    camera.aspect = w/h
    camera.updateProjectionMatrix()
}
handleResize() // once on load
window.addEventListener('resize', debounce(handleResize, 100)) // then on every resize

// Textures
var texLoader = new THREE.TextureLoader()
var loadTex = function(path) {
    var texture = texLoader.load(path)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    return texture
}
var tex = {
}

// Video input
var video = document.getElementById('video')
var videoCanvas = document.getElementById('video-canvas')
var videoCtx = videoCanvas.getContext('2d')

var videoWasSetup = false
function setupVideo() {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.oGetUserMedia
    if (navigator.getUserMedia) {
        navigator.getUserMedia({video: {facingMode: 'environment'}}, (stream) => { video.src = URL.createObjectURL(stream) }, (err) => {})
    }
    videoWasSetup = true
}

var videoTexture = new THREE.Texture(videoCanvas)
videoTexture.minFilter = THREE.LinearFilter
videoTexture.magFilter = THREE.LinearFilter
videoTexture.format = THREE.RGBFormat

function drawVideo() {
    videoCtx.drawImage(video, 0, 0, videoCanvas.clientWidth, videoCanvas.clientHeight)
    videoTexture.needsUpdate = true
    requestAnimationFrame(drawVideo)
}
drawVideo()

// Shader setup
var scene = new THREE.Scene()

var uniforms = {
    video: { type: 't', value: videoTexture },
    viewProjInverse: { type: "m4", value: new THREE.Matrix4() },
    time: { type: 'f', value: 30 },

    saturation: { type: 'f', value: 0 },
    multiply: { type: 'f', value: 1 },

    cameraMultiply: { type: 'f', value: 0 },
    cameraAdd: { type: 'f', value: 0 },
}
var prevUniforms = {} // for diffing

var uniformsExtras = {
    timeScale: 1,
    useCamera: true,

    rotation: 0,
    rotationVelocity: TAU/8,
}

// Scene setup
var sphereGeometry = new THREE.SphereBufferGeometry(100, 50, 50)
sphereGeometry.scale(-1, 1, 1)
var sphere = new THREE.Mesh(sphereGeometry, new THREE.ShaderMaterial({
    vertexShader: document.getElementById('vert').textContent,
    fragmentShader: document.getElementById('frag').textContent,
    uniforms: uniforms,
    depthWrite: false,
    depthTest: false,
}))
scene.add(sphere)

// Stats
var stats = new Stats()
stats.addPanel(new Stats.Panel( '', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)' ))
stats.showPanel(3)
document.body.appendChild(stats.domElement)

// Render loop
function render() {
    stats.begin()

    var dt = uniformsExtras.timeScale * clock.getDelta()

    // view proj
    camera.matrixWorldInverse.getInverse(camera.matrixWorld)
    uniforms.viewProjInverse.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    uniforms.viewProjInverse.value.getInverse(uniforms.viewProjInverse.value)

    // uniforms
    uniforms.time.value += dt

    if (uniformsExtras.useCamera) {
        if (!videoWasSetup) {
            setupVideo()
        }
        if (!uniformsExtras.prevUseCamera) {
            uniforms.cameraMultiply.value = 1
            uniforms.cameraAdd.value = 1
            initGUI()
        }
    } else {
        uniforms.cameraMultiply.value = 0
        uniforms.cameraAdd.value = 0
        if (uniformsExtras.prevUseCamera) {
            initGUI()
        }
    }
    uniformsExtras.prevUseCamera = uniformsExtras.useCamera;

    uniformsExtras.rotation = (uniformsExtras.rotation + uniformsExtras.rotationVelocity * dt) % TAU
    sphere.rotation.y = uniformsExtras.rotation

    // check uniform diffs
    for (key in uniforms) {
        if (uniforms[key].value !== prevUniforms[key]) {
            uniforms[key].needsUpdate = true
        }
        prevUniforms[key] = uniforms[key].value
    }

    deviceOrientation.update()
    renderer.render(scene, camera)

    stats.end()

    requestAnimationFrame(render)
}

// GUI
function initGUI() {
    if (gui) {
        gui.destroy()
    }
    gui = new dat.GUI()

    gui.add(extra, 'source')
        .name('Source code by @foolmoron')
    gui.add(extra, 'zoomUI')
        .name('Toggle UI Zoom')
        .__li.style.padding = "14px 0px"
    
    var fGen = gui.addFolder('General')
    fGen.open()
    fGen.add(uniformsExtras, 'timeScale')
        .name('Time Scale')
        .min(0)
        .max(3)
        .step(0.1)
    fGen.add(uniforms.time, 'value')
        .name('Time')
        .min(0)
        .step(0.1)
    fGen.add(uniformsExtras, 'rotation')
        .name('Rotation')
        .min(0)
        .max(TAU)
        .step(0.1)
    fGen.add(uniformsExtras, 'rotationVelocity')
        .name('Rotation Velocity')
        .min(0)
        .max(TAU * 4)
        .step(0.1)

    var fColor = gui.addFolder('Color')
    fColor.open()
    fColor.add(uniforms.saturation, 'value')
        .name('Saturation')
        .min(0)
        .max(1)
        .step(0.05)
    fColor.add(uniforms.multiply, 'value')
        .name('Multiply')
        .min(0)
        .max(3)
        .step(0.05)

    var fCamera = gui.addFolder('Camera')
    fCamera.open()
    fCamera.add(uniformsExtras, 'useCamera')
        .name('Use Camera')
    fCamera.add(uniforms.cameraMultiply, 'value')
        .name('Multiply')
        .min(0)
        .max(2)
        .step(0.05)
    fCamera.add(uniforms.cameraAdd, 'value')
        .name('Add')
        .min(0)
        .max(2)
        .step(0.05)

    gui.add(extra, 'fullscreen')
        .name('GUI-less Fullscreen Mode! PROTIP: On a phone, lock the screen rotation and rotate it around')

    // zooming
    const scaleAmount = 2
    var mainControls = document.querySelector('.dg.main')
    if (uiZoomed) {
        mainControls.style.transform = `scale(${scaleAmount}) translate3d(-${mainControls.offsetWidth / (scaleAmount*scaleAmount)}px, ${mainControls.offsetHeight / (scaleAmount*scaleAmount)}px, 0)`
    }
}

// Init
window.onload = function() {
    initGUI()
    render()
}