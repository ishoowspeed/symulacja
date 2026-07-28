function getCurrentTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function sendMessage(event) {
    event.preventDefault();
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const container = document.getElementById('messagesContainer');
    
    // User message
    const userMsg = document.createElement('div');
    userMsg.className = 'message outgoing';
    userMsg.innerHTML = `
        <div class="msg-content-wrapper">
            <div class="msg-bubble">${escapeHtml(text)}</div>
            <div class="msg-time">${getCurrentTime()}</div>
        </div>
    `;
    
    container.appendChild(userMsg);
    input.value = '';
    container.scrollTop = container.scrollHeight;
    
    // Auto-reply demo from ELITE system
    setTimeout(() => {
        const botMsg = document.createElement('div');
        botMsg.className = 'message incoming';
        botMsg.innerHTML = `
            <div class="msg-avatar"><i class="fa-solid fa-crown"></i></div>
            <div class="msg-content-wrapper">
                <div class="msg-author">ELITE Bot <span class="badge-elite">ELITE</span></div>
                <div class="msg-bubble">Otrzymano wiadomość w systemie <strong>ELITE</strong>: "${escapeHtml(text)}"</div>
                <div class="msg-time">${getCurrentTime()}</div>
            </div>
        `;
        container.appendChild(botMsg);
        container.scrollTop = container.scrollHeight;
    }, 1000);
}

function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
