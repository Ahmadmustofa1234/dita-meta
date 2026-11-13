// Ecoseaverse Safe Error Handler
// Logging errors safely without corrupting DOM or Three.js WebGL context
window.addEventListener('error', function(e) { 
    console.error('[Ecoseaverse Error]', e.message, 'at', e.filename + ':' + e.lineno);
});

window.addEventListener('unhandledrejection', function(e) { 
    console.warn('[Ecoseaverse Unhandled Rejection]', e.reason);
});
