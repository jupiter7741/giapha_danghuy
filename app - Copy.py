import os
from flask import Flask, render_template, request, jsonify
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

# Khởi tạo Supabase client
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/members', methods=['GET'])
def get_members():
    try:
        response = supabase.table('family_members').select('*').order('generation').execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/members', methods=['POST'])
def add_member():
    try:
        data = request.json
        # Handle empty strings to null for UUIDs
        if not data.get('parent_id'):
            data['parent_id'] = None
            
        response = supabase.table('family_members').upsert(data).execute()
        return jsonify(response.data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# API CHO TAB GIỚI THIỆU (CHUẨN SUPABASE-PY)
# ==========================================

@app.route('/api/articles', methods=['GET'])
def get_articles():
    try:
        response = supabase.table('intro_articles').select('*').execute()
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/articles', methods=['POST'])
def add_article():
    try:
        data = request.json
        
        # Xử lý parent_id nếu để trống
        if not data.get('parent_id'):
            data['parent_id'] = None
            
        # Insert dữ liệu mới
        response = supabase.table('intro_articles').insert(data).execute()
        
        # Lấy ID của bản ghi vừa tạo để trả về cho Frontend hiển thị ngay
        new_id = response.data[0]['id'] if response.data else None
        return jsonify({'id': new_id, 'message': 'Thêm thành công'}), 201
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/articles/<int:id>', methods=['PUT', 'DELETE'])
def modify_article(id):
    try:
        if request.method == 'PUT':
            data = request.json
            
            # Xử lý parent_id nếu để trống
            if not data.get('parent_id'):
                data['parent_id'] = None
                
            response = supabase.table('intro_articles').update(data).eq('id', id).execute()
            return jsonify({'message': 'Cập nhật thành công'}), 200
            
        elif request.method == 'DELETE':
            # Với Supabase, an toàn nhất là xóa các mục con trước, sau đó xóa mục cha
            supabase.table('intro_articles').delete().eq('parent_id', id).execute()
            supabase.table('intro_articles').delete().eq('id', id).execute()
            
            return jsonify({'message': 'Xóa thành công'}), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# API TÌM KIẾM THÀNH VIÊN
# ==========================================
@app.route('/api/search', methods=['GET'])
def search_member():
    try:
        # Lấy từ khóa người dùng nhập vào
        q = request.args.get('q', '').strip()
        
        if not q:
            return jsonify([]), 200
            
        # Tìm kiếm không phân biệt hoa thường (ilike) trên cả 2 cột: Họ tên và Số điện thoại
        # Cú pháp or_ của Supabase yêu cầu viết gộp như sau:
        search_query = f"full_name.ilike.%{q}%,phone.ilike.%{q}%"
        
        response = supabase.table('family_members').select('*').or_(search_query).execute()
        
        return jsonify(response.data), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
if __name__ == '__main__':
    app.run(debug=True, port=5000)