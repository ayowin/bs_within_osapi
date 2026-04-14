"""
数据库模型
"""

from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class FileAccessLog(db.Model):
    """文件访问日志模型"""
    __tablename__ = 'file_access_logs'

    id = db.Column(db.Integer, primary_key=True)
    operation = db.Column(db.String(50), nullable=False)
    file_path = db.Column(db.String(500))
    file_name = db.Column(db.String(255))
    status = db.Column(db.String(20), default='success')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
