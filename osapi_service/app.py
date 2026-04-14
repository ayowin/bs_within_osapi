"""
WinOnline OS API Service
本地文件操作系统，提供文件浏览和 Markdown 编辑功能
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime
import os

from models import db, FileAccessLog


class Config:
    """配置类"""
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = f"sqlite:///{os.path.join(BASE_DIR, 'osapi.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = "osapi-secret-key-2024"
    ALLOWED_ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    CORS(app)
    db.init_app(app)

    with app.app_context():
        db.create_all()

    return app


def log_file_access(operation, file_path, file_name, status='success'):
    """记录文件操作日志"""
    log = FileAccessLog(
        operation=operation,
        file_path=file_path,
        file_name=file_name,
        status=status
    )
    db.session.add(log)
    db.session.commit()
    return log


def validate_path(file_path):
    """验证文件路径安全性"""
    return True  # 允许访问所有路径


def ensure_markdown_file(file_path):
    """确保文件路径以 .md 结尾"""
    if not file_path.endswith('.md'):
        if '.' in os.path.basename(file_path):
            base, _ = os.path.splitext(file_path)
            return base + '.md'
        return file_path + '.md'
    return file_path


app = create_app()


# ============== 系统信息 ==============

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'service': 'wineoline-osapi'})


@app.route('/api/system/info', methods=['GET'])
def system_info():
    return jsonify({
        'hostname': os.environ.get('COMPUTERNAME', 'unknown'),
        'username': os.environ.get('USERNAME', 'unknown'),
        'platform': os.name
    })


@app.route('/api/system/drives', methods=['GET'])
def list_drives():
    """列出可用驱动器"""
    import string
    drives = []
    for letter in string.ascii_uppercase:
        drive = f"{letter}:\\"
        if os.path.exists(drive):
            drives.append(drive)
    return jsonify({'drives': drives})


# ============== 目录操作 ==============

@app.route('/api/directory/list', methods=['POST'])
def list_directory():
    data = request.get_json()
    path = data.get('path', Config.ALLOWED_ROOT)

    if not validate_path(path):
        return jsonify({'error': '路径访问被拒绝'}), 403

    try:
        entries = []
        for entry in os.scandir(path):
            try:
                entries.append({
                    'name': entry.name,
                    'path': entry.path,
                    'is_dir': entry.is_dir(),
                    'is_file': entry.is_file(),
                    'size': entry.stat().st_size if entry.is_file() else None,
                    'modified': datetime.fromtimestamp(entry.stat().st_mtime).isoformat()
                })
            except:
                continue

        entries.sort(key=lambda x: (not x['is_dir'], x['name'].lower()))
        return jsonify({'path': path, 'entries': entries})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/directory/create', methods=['POST'])
def create_directory():
    data = request.get_json()
    path = data.get('path')

    if not path:
        return jsonify({'error': '路径不能为空'}), 400

    if not validate_path(path):
        return jsonify({'error': '路径访问被拒绝'}), 403

    try:
        os.makedirs(path, exist_ok=True)
        log_file_access('create_dir', path, os.path.basename(path), 'success')
        return jsonify({'success': True, 'path': path})
    except Exception as e:
        log_file_access('create_dir', path, os.path.basename(path), 'failed')
        return jsonify({'error': str(e)}), 500


# ============== 文件操作 ==============

@app.route('/api/file/read', methods=['GET'])
def read_file():
    file_path = request.args.get('path', '')

    if not file_path:
        return jsonify({'error': '文件路径不能为空'}), 400

    file_path = ensure_markdown_file(file_path)

    if not validate_path(file_path):
        return jsonify({'error': '路径访问被拒绝'}), 403

    try:
        if not os.path.exists(file_path):
            return jsonify({'error': '文件不存在'}), 404

        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        size = os.path.getsize(file_path)
        log_file_access('read', file_path, os.path.basename(file_path), 'success')

        return jsonify({
            'content': content,
            'size': size,
            'path': file_path
        })
    except Exception as e:
        log_file_access('read', file_path, os.path.basename(file_path), 'failed')
        return jsonify({'error': str(e)}), 500


@app.route('/api/file/create', methods=['POST'])
def create_file():
    data = request.get_json()
    file_path = data.get('path', '')
    content = data.get('content', '')

    if not file_path:
        return jsonify({'error': '文件路径不能为空'}), 400

    file_path = ensure_markdown_file(file_path)

    if not validate_path(file_path):
        return jsonify({'error': '路径访问被拒绝'}), 403

    try:
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        log_file_access('create', file_path, os.path.basename(file_path), 'success')
        return jsonify({'success': True, 'path': file_path})
    except Exception as e:
        log_file_access('create', file_path, os.path.basename(file_path), 'failed')
        return jsonify({'error': str(e)}), 500


@app.route('/api/file/update', methods=['PUT'])
def update_file():
    data = request.get_json()
    file_path = data.get('path', '')
    content = data.get('content', '')

    if not file_path:
        return jsonify({'error': '文件路径不能为空'}), 400

    file_path = ensure_markdown_file(file_path)

    if not validate_path(file_path):
        return jsonify({'error': '路径访问被拒绝'}), 403

    try:
        if not os.path.exists(file_path):
            return jsonify({'error': '文件不存在'}), 404

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

        log_file_access('update', file_path, os.path.basename(file_path), 'success')
        return jsonify({'success': True, 'path': file_path})
    except Exception as e:
        log_file_access('update', file_path, os.path.basename(file_path), 'failed')
        return jsonify({'error': str(e)}), 500


@app.route('/api/file/delete', methods=['DELETE'])
def delete_file():
    file_path = request.args.get('path', '')

    if not file_path:
        return jsonify({'error': '文件路径不能为空'}), 400

    file_path = ensure_markdown_file(file_path)

    if not validate_path(file_path):
        return jsonify({'error': '路径访问被拒绝'}), 403

    try:
        if not os.path.exists(file_path):
            return jsonify({'error': '文件不存在'}), 404

        os.remove(file_path)
        log_file_access('delete', file_path, os.path.basename(file_path), 'success')
        return jsonify({'success': True})
    except Exception as e:
        log_file_access('delete', file_path, os.path.basename(file_path), 'failed')
        return jsonify({'error': str(e)}), 500


@app.route('/api/file/exists', methods=['GET'])
def file_exists():
    file_path = request.args.get('path', '')

    if not file_path:
        return jsonify({'error': '文件路径不能为空'}), 400

    file_path = ensure_markdown_file(file_path)

    if not validate_path(file_path):
        return jsonify({'error': '路径访问被拒绝'}), 403

    return jsonify({
        'path': file_path,
        'exists': os.path.exists(file_path)
    })


# ============== 日志 ==============

@app.route('/api/logs/files', methods=['GET'])
def get_file_logs():
    logs = FileAccessLog.query.order_by(FileAccessLog.created_at.desc()).limit(100).all()
    return jsonify({
        'logs': [{
            'id': log.id,
            'operation': log.operation,
            'file_name': log.file_name,
            'file_path': log.file_path,
            'status': log.status,
            'created_at': log.created_at.isoformat() if log.created_at else None
        } for log in logs]
    })


if __name__ == '__main__':
    print("=" * 50)
    print("WinOnline OS API Service")
    print("服务地址: http://127.0.0.1:8888")
    print("=" * 50)
    app.run(host='127.0.0.1', port=8888, debug=True)
