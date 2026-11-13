"""Buat dokumen Word ringkasan alur Ecoseaverse Bab 6 IPA Kelas VII.

Data misi, materi, dan soal dibaca langsung dari learning-data.js sehingga
dokumen selalu sama dengan isi aplikasi.
"""
import json
import os
import subprocess
import sys
import tempfile

import docx
from docx.shared import Inches

ROOT = os.path.dirname(os.path.abspath(__file__))


def load_learning_data():
    """Baca modul data .js sebagai ES module, termasuk pada Node 16."""
    # Data URL menjaga modul data mandiri tetap ESM tanpa mengubah server.js
    # (CommonJS). Node versi lama menganggap file .js sebagai CommonJS.
    script = (
        "const source = require('fs').readFileSync('./learning-data.js');"
        "import('data:text/javascript;base64,' + source.toString('base64'))"
        ".then(m => process.stdout.write(JSON.stringify({"
        "missions: m.missions, chapters: m.chapters, pretest: m.pretestQuestions,"
        "posttest: m.posttestQuestions, avatars: m.avatars })))"
    )
    result = subprocess.run(
        ['node', '-e', script],
        cwd=ROOT,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout.decode('utf-8'))


def build_document(data):
    doc = docx.Document()
    doc.add_heading('Alur Game Ecoseaverse — Bab 6: Ekologi dan Keanekaragaman Hayati Indonesia', 0)
    doc.add_paragraph(
        'IPA Kelas VII. Rujukan: Inabuy dkk. (2021), hlm. 162-185. '
        'Materi Kerang Bambu (Lorjuk) hanya berada di Virtual Lab dan tidak dihitung dalam misi.'
    )

    doc.add_heading('Pre-test Bab 6 (15 soal)', level=1)
    doc.add_paragraph(
        'Tiga soal untuk setiap subbab A-E. Gateway menuju Misi 2.'
    )
    for index, question in enumerate(data['pretest'], start=1):
        doc.add_paragraph(
            f'{index}. [Subbab {question["chapter"]}] {question["prompt"]}',
            style='List Number',
        )

    for mission in data['missions']:
        doc.add_heading(f"Misi {mission['title']}", level=1)
        doc.add_paragraph('Tag: ' + mission.get('tag', '-'))
        doc.add_paragraph('Deskripsi: ' + mission.get('description', '-'))
        doc.add_paragraph('Pesan AI: ' + mission.get('ai', '-'))

        if mission.get('chapter'):
            chapter = next(c for c in data['chapters'] if c['id'] == mission['chapter'])
            doc.add_paragraph(
                f'Materi: Subbab {chapter["id"]} — {chapter["title"]} (hlm. {chapter["pages"]})'
            )
        if mission.get('type') == 'avatar':
            doc.add_paragraph('Tugas: pilih avatar: ' + ', '.join(a['name'] for a in data['avatars']))

        questions = mission.get('questions') or []
        if questions:
            doc.add_paragraph(f'Soal: {len(questions)} soal pilihan ganda')
            for index, question in enumerate(questions, start=1):
                doc.add_paragraph(
                    f'{index}. [Subbab {question["chapter"]}] {question["prompt"]}',
                    style='List Number',
                )

        doc.add_page_break()

    doc.add_heading('Post-test Bab 6 (15 soal)', level=1)
    for index, question in enumerate(data['posttest'], start=1):
        doc.add_paragraph(
            f'{index}. [Subbab {question["chapter"]}] {question["prompt"]}',
            style='List Number',
        )

    output = os.path.join(ROOT, 'Alur_Game_Ecoseaverse_Bab6.docx')
    doc.save(output)
    return output


if __name__ == '__main__':
    try:
        data = load_learning_data()
    except (subprocess.CalledProcessError, FileNotFoundError) as error:
        sys.exit(f"Gagal membaca learning-data.js: {error}")
    print('Dokumen disimpan di', build_document(data))
