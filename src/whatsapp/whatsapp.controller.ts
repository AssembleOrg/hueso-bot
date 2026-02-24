import {
  Controller,
  Get,
  Post,
  Delete,
  Res,
  UseGuards,
  HttpCode,
  Body,
  UseInterceptors,
  UploadedFile,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { WhatsappGateway } from './whatsapp.gateway';
import { AdminGuard } from './admin.guard';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly gateway: WhatsappGateway) {}

  // -----------------------------------------------------------------
  // Public: serves the SPA (password check happens client-side → API)
  // -----------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: 'Panel de administración WhatsApp (HTML)' })
  getPanel(@Res() res: Response) {
    return res.type('html').send(ADMIN_HTML);
  }

  // -----------------------------------------------------------------
  // Protected API endpoints (require ADMIN_PASSWORD)
  // -----------------------------------------------------------------

  @Get('qr-data')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Obtener datos de QR y estado de conexión' })
  @ApiQuery({ name: 'key', required: false, description: 'Admin password' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getQrData() {
    return {
      qr: this.gateway.getQr(),
      connected: this.gateway.isConnected(),
      waitingForQr: this.gateway.getQr() !== null,
    };
  }

  @Get('status')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Estado de conexión de WhatsApp' })
  @ApiQuery({ name: 'key', required: false, description: 'Admin password' })
  @ApiResponse({ status: 200 })
  getStatus() {
    return {
      connected: this.gateway.isConnected(),
      waitingForQr: this.gateway.getQr() !== null,
    };
  }

  @Delete('session')
  @UseGuards(AdminGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Eliminar sesión de WhatsApp y forzar nuevo QR' })
  @ApiQuery({ name: 'key', required: false, description: 'Admin password' })
  @ApiResponse({ status: 200, description: 'Session deleted' })
  async deleteSession() {
    await this.gateway.deleteSession();
    return { message: 'Session deleted. A new QR will be generated.' };
  }

  // -----------------------------------------------------------------
  // Send message (requires SEND_MESSAGE_PASSWORD)
  // -----------------------------------------------------------------

  @Post('send-message')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Enviar mensaje con archivo opcional' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['password', 'jid', 'text'],
      properties: {
        password: { type: 'string' },
        jid: { type: 'string', example: '5491112345678@s.whatsapp.net' },
        text: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Mensaje enviado' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async sendMessage(
    @Body() body: { password: string; jid: string; text: string },
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const expected = process.env.SEND_MESSAGE_PASSWORD;
    if (!expected || body.password !== expected) {
      throw new UnauthorizedException('Invalid password.');
    }

    if (file) {
      await this.gateway.sendDocument(
        body.jid,
        file.buffer,
        file.mimetype,
        file.originalname,
        body.text,
      );
    } else {
      await this.gateway.sendMessage(body.jid, body.text);
    }

    return { sent: true };
  }
}

// -----------------------------------------------------------------
// Admin panel HTML
// -----------------------------------------------------------------

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Hueso Bot — WhatsApp Admin</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #0a0a0a;
      color: #e4e4e7;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .container {
      width: 100%;
      max-width: 420px;
      padding: 2rem;
    }

    /* ---- Header ---- */
    .header {
      text-align: center;
      margin-bottom: 2rem;
    }
    .header .logo {
      font-size: 2.5rem;
      margin-bottom: .5rem;
    }
    .header h1 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #fafafa;
    }
    .header p {
      font-size: .85rem;
      color: #71717a;
      margin-top: .25rem;
    }

    /* ---- Card ---- */
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 1.5rem;
    }

    /* ---- Form ---- */
    label {
      display: block;
      font-size: .8rem;
      font-weight: 500;
      color: #a1a1aa;
      margin-bottom: .4rem;
      text-transform: uppercase;
      letter-spacing: .05em;
    }
    input[type="password"] {
      width: 100%;
      padding: .65rem .85rem;
      border-radius: 8px;
      border: 1px solid #3f3f46;
      background: #09090b;
      color: #fafafa;
      font-size: .95rem;
      outline: none;
      transition: border-color .15s;
    }
    input[type="password"]:focus {
      border-color: #a78bfa;
    }

    /* ---- Buttons ---- */
    .btn {
      width: 100%;
      padding: .7rem;
      border: none;
      border-radius: 8px;
      font-size: .9rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .15s;
      margin-top: .75rem;
    }
    .btn:hover { opacity: .85; }
    .btn:disabled { opacity: .4; cursor: not-allowed; }

    .btn-primary {
      background: #7c3aed;
      color: #fff;
    }
    .btn-danger {
      background: #dc2626;
      color: #fff;
      margin-top: 1rem;
    }

    /* ---- Status badge ---- */
    .status {
      display: inline-flex;
      align-items: center;
      gap: .4rem;
      font-size: .85rem;
      font-weight: 500;
      padding: .35rem .75rem;
      border-radius: 999px;
      margin-bottom: 1rem;
    }
    .status .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
    }
    .status-connected      { background: #052e16; color: #4ade80; }
    .status-connected .dot { background: #4ade80; }
    .status-waiting        { background: #422006; color: #fb923c; }
    .status-waiting .dot   { background: #fb923c; }
    .status-offline        { background: #1c1917; color: #78716c; }
    .status-offline .dot   { background: #78716c; }

    /* ---- QR area ---- */
    .qr-wrap {
      display: flex;
      justify-content: center;
      margin: 1rem 0;
    }
    .qr-wrap canvas {
      border-radius: 12px;
      background: #fff;
      padding: 12px;
    }

    .msg {
      text-align: center;
      font-size: .85rem;
      color: #a1a1aa;
      margin: 1rem 0;
    }

    .error {
      color: #f87171;
      font-size: .85rem;
      margin-top: .5rem;
      text-align: center;
    }

    /* ---- Divider ---- */
    hr {
      border: none;
      border-top: 1px solid #27272a;
      margin: 1.25rem 0;
    }
  </style>
</head>
<body>

<div class="container">
  <div class="header">
    <div class="logo">🦴</div>
    <h1>Distribuidora El Hueso</h1>
    <p>Panel de administración — WhatsApp</p>
  </div>

  <!-- Login screen -->
  <div class="card" id="login-card">
    <form id="login-form">
      <label for="pwd">Contraseña de administrador</label>
      <input type="password" id="pwd" placeholder="Ingresá la contraseña" autocomplete="off" autofocus>
      <div class="error" id="login-error"></div>
      <button type="submit" class="btn btn-primary">Ingresar</button>
    </form>
  </div>

  <!-- Dashboard (hidden until auth) -->
  <div class="card" id="dashboard" style="display:none">
    <div style="text-align:center">
      <div id="status-badge"></div>
    </div>

    <div id="qr-area"></div>
    <div id="msg-area"></div>

    <hr>
    <button class="btn btn-danger" id="btn-delete">Eliminar sesión y generar nuevo QR</button>
    <div class="error" id="dash-error"></div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js"></script>
<script>
(function() {
  const $ = (s) => document.querySelector(s);
  let adminKey = '';
  let polling = null;

  // --- Login ---
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = $('#pwd').value.trim();
    if (!pwd) return;
    $('#login-error').textContent = '';

    try {
      const res = await api('/whatsapp/qr-data', pwd);
      if (!res.ok) throw new Error(res.status === 401 ? 'Contraseña incorrecta' : 'Error del servidor');
      adminKey = pwd;
      sessionStorage.setItem('ak', pwd);
      showDashboard();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  // --- Auto-login from sessionStorage ---
  const saved = sessionStorage.getItem('ak');
  if (saved) {
    adminKey = saved;
    showDashboard();
  }

  // --- Dashboard ---
  function showDashboard() {
    $('#login-card').style.display = 'none';
    $('#dashboard').style.display = 'block';
    refresh();
    polling = setInterval(refresh, 4000);
  }

  async function refresh() {
    try {
      const res = await api('/whatsapp/qr-data', adminKey);
      if (res.status === 401) { logout(); return; }
      const data = await res.json();
      renderStatus(data);
    } catch {
      $('#dash-error').textContent = 'Error al consultar el servidor';
    }
  }

  function renderStatus(data) {
    $('#dash-error').textContent = '';
    const badge = $('#status-badge');
    const qrArea = $('#qr-area');
    const msgArea = $('#msg-area');

    if (data.connected) {
      badge.innerHTML = '<span class="status status-connected"><span class="dot"></span>Conectado</span>';
      qrArea.innerHTML = '';
      msgArea.innerHTML = '<div class="msg">WhatsApp vinculado y funcionando.</div>';
    } else if (data.qr) {
      badge.innerHTML = '<span class="status status-waiting"><span class="dot"></span>Esperando escaneo</span>';
      qrArea.innerHTML = '<div class="qr-wrap"><canvas id="qr-canvas"></canvas></div>';
      new QRious({ element: $('#qr-canvas'), value: data.qr, size: 260, backgroundAlpha: 0 });
      msgArea.innerHTML = '<div class="msg">Abrí WhatsApp &rarr; Dispositivos vinculados &rarr; Vincular dispositivo</div>';
    } else {
      badge.innerHTML = '<span class="status status-offline"><span class="dot"></span>Conectando...</span>';
      qrArea.innerHTML = '';
      msgArea.innerHTML = '<div class="msg">Esperando QR del servidor. Se actualiza automáticamente.</div>';
    }
  }

  // --- Delete session ---
  $('#btn-delete').addEventListener('click', async () => {
    if (!confirm('¿Seguro? Esto elimina la sesión y vas a tener que escanear un nuevo QR.')) return;
    $('#btn-delete').disabled = true;
    try {
      const res = await fetch('/whatsapp/session?key=' + encodeURIComponent(adminKey), { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      setTimeout(refresh, 2000);
    } catch (err) {
      $('#dash-error').textContent = err.message;
    } finally {
      $('#btn-delete').disabled = false;
    }
  });

  // --- Helpers ---
  function api(path, key) {
    return fetch(path + '?key=' + encodeURIComponent(key));
  }

  function logout() {
    sessionStorage.removeItem('ak');
    clearInterval(polling);
    $('#login-card').style.display = 'block';
    $('#dashboard').style.display = 'none';
    $('#login-error').textContent = 'Sesión expirada. Ingresá de nuevo.';
  }
})();
</script>

</body>
</html>`;
