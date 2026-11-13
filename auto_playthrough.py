"""Rekam alur belajar Ecoseaverse: Misi 1 -> Pre-test -> Misi 2-6 -> Misi 7."""
import sys
import time
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

URL = 'http://localhost:3000'

BANNER_JS = '''() => {
    const banner = document.createElement('div');
    banner.id = 'rec-helper-banner';
    banner.style.position = 'fixed';
    banner.style.top = '15px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.zIndex = '99999';
    banner.style.background = 'rgba(2, 6, 23, 0.95)';
    banner.style.border = '2px solid #38bdf8';
    banner.style.color = '#fff';
    banner.style.padding = '12px 28px';
    banner.style.borderRadius = '30px';
    banner.style.fontFamily = 'Poppins, sans-serif';
    banner.style.fontSize = '1.05rem';
    banner.style.fontWeight = '700';
    banner.style.boxShadow = '0 0 25px rgba(56, 189, 248, 0.6)';
    banner.style.display = 'flex';
    banner.style.alignItems = 'center';
    banner.style.gap = '12px';
    banner.innerHTML = '<span style="color:#ef4444; font-size:1.4rem;">\\u25cf</span> <span id="rec-helper-txt">Siapkan Rekam Layar (OBS / Win+Alt+R)... Memulai dalam 5 detik</span>';
    document.body.appendChild(banner);
}'''

FINAL_BANNER_JS = '''(points, badges) => {
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '150px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.zIndex = '99999';
    banner.style.background = 'linear-gradient(135deg, rgba(4, 28, 64, 0.95), rgba(6, 78, 59, 0.95))';
    banner.style.border = '2px solid #34d399';
    banner.style.color = '#fff';
    banner.style.padding = '20px 40px';
    banner.style.borderRadius = '24px';
    banner.style.fontFamily = 'Poppins, sans-serif';
    banner.style.textAlign = 'center';
    banner.style.boxShadow = '0 0 35px rgba(52, 211, 153, 0.7)';
    banner.innerHTML = '<h2 style="margin:0 0 8px 0; color:#6ee7b7; font-size:1.6rem;">\\ud83c\\udfc6 EKSPEDISI BAB 6 SELESAI!</h2>'
        + '<p style="margin:0; font-size:1.05rem; color:#e2e8f0;">Subbab A\\u2013E dipelajari \\u00b7 Misi 1\\u20137 tuntas \\u00b7 Poin: ' + points + ' \\u00b7 Badge: ' + badges + '</p>';
    document.body.appendChild(banner);
}'''

ANSWER_ALL_JS = '''() => {
    // Jawab soal yang sedang tampil dengan memilih opsi pertama yang tersedia.
    const options = [...document.querySelectorAll('#popup-task-area .assessment-options .task-choice')];
    if (options.length) options[0].click();
    return options.length;
}'''

# Klik lewat JS: halaman WebGL membuat pemeriksaan stabilitas elemen berjalan
# sangat lama, sementara tombol aksi sudah berada di footer sticky.
PRESS_ACTION_JS = '''() => {
    const button = document.getElementById('popup-action');
    if (!button || button.disabled) return false;
    button.click();
    return true;
}'''


def click_action(page):
    for _ in range(30):
        if page.evaluate(PRESS_ACTION_JS):
            time.sleep(0.7)
            return True
        time.sleep(0.1)
    return False


def answer_all(page, label, total):
    """Kumpulkan jawaban satu per satu sampai popup menampilkan hasil."""
    for step in range(total + 6):
        if page.locator('#popup-task-area .assessment-score').count():
            print(f"      {label}: hasil tampil, {total} soal terjawab")
            return True
        if page.locator('#popup-task-area .assessment-options').count():
            picked = page.evaluate(ANSWER_ALL_JS)
            if not picked:
                print(f"      [GAGAL] {label}: opsi tidak ditemukan")
                return False
            time.sleep(0.35)
        if not click_action(page):
            print(f"      [GAGAL] {label}: tombol aksi tidak aktif pada langkah {step}")
            return False
    return bool(page.locator('#popup-task-area .assessment-score').count())


def run_playthrough():
    print('=' * 60)
    print('[*] ECOSEAVERSE AUTOMATED PLAYTHROUGH RECORDER')
    print('Alur: Misi 1 (avatar) -> Pre-test -> Misi 2-6 (A-E) -> Misi 7 (post-test)')
    print('=' * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=['--start-maximized', '--no-sandbox', '--disable-infobars', '--window-size=1920,1080']
        )
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.on('console', lambda msg: errors.append(f'console.{msg.type}: {msg.text}') if msg.type == 'error' else None)

        print(f'1. Mengakses {URL} ...')
        page.goto(URL, timeout=60000)
        page.evaluate(BANNER_JS)

        for i in range(5, 0, -1):
            print(f'   [REKAM LAYAR] Memulai dalam {i} detik...')
            page.evaluate(f'''() => {{
                const el = document.getElementById('rec-helper-txt');
                if (el) el.innerText = 'Siapkan Rekam Layar (OBS / Win+Alt+R)... Memulai dalam {i} detik';
            }}''')
            time.sleep(1)

        page.evaluate('''() => {
            const el = document.getElementById('rec-helper-txt');
            if (el) el.innerHTML = '<span style="color:#22c55e;">\\u25cf Sedang Merekam Alur Ecoseaverse</span>';
            setTimeout(() => {
                const b = document.getElementById('rec-helper-banner');
                if (b) {
                    b.style.transition = 'opacity 1s ease';
                    b.style.opacity = '0';
                    setTimeout(() => b.remove(), 1000);
                }
            }, 3000);
        }''')

        page.wait_for_selector('#start-btn', timeout=30000)
        time.sleep(1)
        print("2. Memulai game (klik 'Mulai Menjelajah')...")
        page.locator('#participant-name').fill('Peserta Demo')
        page.click('#start-btn')
        time.sleep(2.5)

        print('3. Virtual Lab Lorjuk (eksplorasi di luar misi)...')
        page.evaluate('() => window.openClamModal()')
        time.sleep(4.5)
        page.evaluate('() => window.closeClamModal()')
        time.sleep(1.5)

        # Misi 1: avatar
        print('4. Misi 1: pilih avatar penjelajah...')
        page.evaluate('() => window.openMissionPopup(0)')
        time.sleep(2.2)
        page.evaluate('''() => {
            const target = document.querySelector('#popup-task-area .avatar-choice');
            if (target) target.click();
        }''')
        time.sleep(1.2)
        click_action(page)  # Simpan Avatar
        time.sleep(1.5)

        # Pre-test
        print('5. Pre-test Bab 6 (15 soal)...')
        click_action(page)  # Mulai Pre-test
        time.sleep(1.8)
        answer_all(page, 'Pre-test', 15)
        click_action(page)  # Lanjut ke Misi 2
        time.sleep(2.0)

        # Misi 2-6: subbab A-E, tiap misi 10 soal
        for mission_index, chapter in enumerate(['A', 'B', 'C', 'D', 'E'], start=1):
            print(f'{mission_index + 4}. Misi {mission_index + 1} · Subbab {chapter} (10 soal)...')
            page.evaluate(f'() => window.openMissionPopup({mission_index})')
            time.sleep(2.2)
            click_action(page)  # Mulai 10 Soal (tahap materi)
            time.sleep(1.8)
            answer_all(page, f'Misi {mission_index + 1}/{chapter}', 10)
            click_action(page)  # Lanjut ke Misi berikutnya
            time.sleep(2.0)

        # Misi 7: post-test
        print('10. Misi 7: Post-test Bab 6 (15 soal)...')
        page.evaluate('() => window.openMissionPopup(6)')
        time.sleep(2.2)
        answer_all(page, 'Post-test', 15)
        time.sleep(1.5)
        click_action(page)  # Selesai · Kembali Menjelajah
        time.sleep(1.5)

        print('11. Ringkasan akhir...')
        stats = page.evaluate('''() => ({
            points: document.getElementById('hud-points')?.textContent || '-',
            badges: document.getElementById('hud-badges')?.textContent || '-',
            done: [...document.querySelectorAll('.m-node.is-done')].length
        })''')
        print(f"    Poin: {stats['points']} | Badge: {stats['badges']} | Misi selesai: {stats['done']}/7")
        page.evaluate(FINAL_BANNER_JS, [str(stats['points']), str(stats['badges'])])
        time.sleep(3)

        for _ in range(60):
            page.evaluate('() => { if (window.camera) window.camera.rotation.y += 0.01; }')
            time.sleep(0.1)

        if errors:
            print('\n[!] Error browser terdeteksi:')
            for err in errors[:20]:
                print('   -', err)
        else:
            print('\n[OK] Tidak ada error JavaScript selama playthrough.')

        print('\n' + '=' * 60)
        print('[OK] PLAYTHROUGH SELESAI! Browser tetap terbuka 20 detik.')
        print('=' * 60)
        time.sleep(20)
        browser.close()


if __name__ == '__main__':
    run_playthrough()
