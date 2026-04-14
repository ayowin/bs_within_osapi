"""
PyInstaller 打包脚本
将 OS API 服务打包成独立的 Windows 可执行文件
"""

import os
import sys
import subprocess


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 检查依赖
    try:
        subprocess.run(['pyinstaller', '--version'], capture_output=True, check=True)
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("错误: 未安装 PyInstaller")
        print("请运行: pip install pyinstaller")
        return
    
    osapi_script = os.path.join(script_dir, 'app.py')
    if not os.path.exists(osapi_script):
        print(f"错误: 未找到 {osapi_script}")
        return
    
    print("正在打包 OS API 服务...")
    print()
    
    cmd = [
        'pyinstaller',
        '--onefile',
        '--windowed',
        '--name', 'osapi_server',
        '--distpath', 'dist',
        '--workpath', 'build',
        '--specpath', 'build',
        '--collect-all', 'flask',
        '--collect-all', 'flask_cors',
        '--collect-all', 'flask_sqlalchemy',
        '--collect-all', 'werkzeug',
        '--collect-all', 'sqlalchemy',
        osapi_script
    ]
    
    result = subprocess.run(cmd, cwd=script_dir)
    
    if result.returncode == 0:
        print()
        print("打包成功!")
        exe_path = os.path.join(script_dir, 'dist', 'osapi_server.exe')
        if os.path.exists(exe_path):
            size_mb = os.path.getsize(exe_path) / (1024 * 1024)
            print(f"输出: {exe_path}")
            print(f"文件大小: {size_mb:.1f} MB")
    else:
        print()
        print("打包失败")


if __name__ == '__main__':
    main()
