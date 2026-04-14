"""
WinOnline 后端服务
提供用户认证、日志管理、用户CRUD等功能
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from functools import wraps
import jwt
import bcrypt
from datetime import datetime, timedelta
from models import db, User, UserLog


def create_app():
    app = Flask(__name__)
    app.config.from_object('config.Config')

    CORS(app, resources={r"/api/*": {"origins": "*"}})
    db.init_app(app)

    with app.app_context():
        db.create_all()
        init_default_user()

    return app


def init_default_user():
    """初始化默认管理员账户"""
    if not User.query.filter_by(username='admin').first():
        password_hash = bcrypt.hashpw('admin123'.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        admin = User(
            username='admin',
            password_hash=password_hash,
            display_name='管理员',
            email='admin@wineoline.local',
            is_active=True
        )
        db.session.add(admin)
        db.session.commit()
        print("默认管理员账户已创建: admin / admin123")


def require_auth(f):
    """认证装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization')

        if auth_header and auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]

        if not token:
            return jsonify({'error': '未提供认证令牌'}), 401

        try:
            payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
            current_user = User.query.get(payload['user_id'])
            if not current_user:
                return jsonify({'error': '用户不存在'}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({'error': '令牌已过期'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': '无效的令牌'}), 401

        return f(current_user, *args, **kwargs)
    return decorated


app = create_app()


# ============== CORS 处理 ==============

@app.before_request
def handle_cors_preflight():
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, Origin, Accept'
        return response


# ============== 认证 API ==============

@app.route('/api/auth/login', methods=['POST', 'OPTIONS'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': '用户名和密码不能为空'}), 400

    user = User.query.filter_by(username=username).first()

    if not user or not bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8')):
        return jsonify({'error': '用户名或密码错误'}), 401

    if not user.is_active:
        return jsonify({'error': '账户已被禁用'}), 403

    # 记录登录日志
    log = UserLog(
        user_id=user.id,
        action='login',
        description=f'用户 {username} 登录成功',
        ip_address=request.remote_addr,
        status='success'
    )
    db.session.add(log)
    db.session.commit()

    # 生成 JWT 令牌
    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.utcnow() + timedelta(days=7)
    }, app.config['SECRET_KEY'], algorithm='HS256')

    return jsonify({
        'token': token,
        'user': user.to_dict()
    })


# ============== 用户管理 API ==============

@app.route('/api/users', methods=['GET', 'POST', 'OPTIONS'])
@require_auth
def get_users(current_user):
    if request.method == 'POST':
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({'error': '用户名和密码不能为空'}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({'error': '用户名已存在'}), 400

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

        user = User(
            username=username,
            password_hash=password_hash,
            email=data.get('email'),
            display_name=data.get('display_name'),
            is_active=True
        )
        db.session.add(user)
        db.session.commit()

        log = UserLog(
            user_id=current_user.id,
            action='create_user',
            description=f'创建用户 {username}',
            ip_address=request.remote_addr,
            status='success'
        )
        db.session.add(log)
        db.session.commit()

        return jsonify(user.to_dict()), 201

    users = User.query.all()
    return jsonify([u.to_dict() for u in users])


@app.route('/api/users/<int:user_id>', methods=['GET', 'PUT', 'DELETE', 'OPTIONS'])
@require_auth
def user_detail(current_user, user_id):
    user = User.query.get_or_404(user_id)

    if request.method == 'GET':
        return jsonify(user.to_dict())

    elif request.method == 'PUT':
        data = request.get_json()

        if 'email' in data:
            user.email = data['email']
        if 'display_name' in data:
            user.display_name = data['display_name']
        if 'password' in data and data['password']:
            user.password_hash = bcrypt.hashpw(data['password'].encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        if 'is_active' in data:
            user.is_active = data['is_active']

        db.session.commit()

        log = UserLog(
            user_id=current_user.id,
            action='update_user',
            description=f'更新用户 {user.username}',
            ip_address=request.remote_addr,
            status='success'
        )
        db.session.add(log)
        db.session.commit()

        return jsonify(user.to_dict())

    elif request.method == 'DELETE':
        if user.id == current_user.id:
            return jsonify({'error': '不能删除自己'}), 400

        username = user.username
        db.session.delete(user)
        db.session.commit()

        log = UserLog(
            user_id=current_user.id,
            action='delete_user',
            description=f'删除用户 {username}',
            ip_address=request.remote_addr,
            status='success'
        )
        db.session.add(log)
        db.session.commit()

        return jsonify({'message': '用户已删除'})


# ============== 日志 API ==============

@app.route('/api/logs', methods=['GET', 'OPTIONS'])
@require_auth
def get_logs(current_user):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)

    logs = UserLog.query.order_by(UserLog.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )

    return jsonify({
        'logs': [log.to_dict() for log in logs.items],
        'pages': logs.pages,
        'total': logs.total
    })


if __name__ == '__main__':
    print("=" * 50)
    print("WinOnline 后端服务")
    print("API地址: http://localhost:5000")
    print("默认账户: admin / admin123")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True)
