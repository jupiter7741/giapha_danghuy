import os
import requests
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from supabase import create_client, Client
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "super-secret-key-for-session")

# Cấu hình Supabase
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

# Cấu hình Google SSO (Cần thêm vào file .env)
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")

# ==========================================
# AUTH API (ĐĂNG NHẬP & PHÂN QUYỀN)
# ==========================================
@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    user = session.get('user')
    return jsonify({"user": user}), 200

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    res = supabase.table('users').select('*').eq('username', username).execute()
    users = res.data
    
    if len(users) > 0 and check_password_hash(users[0]['password_hash'], password):
        user = users[0]
        session['user'] = {"id": user['id'], "username": user['username'], "role": user['role']}
        return jsonify({"message": "Đăng nhập thành công", "user": session['user']}), 200
    
    return jsonify({"error": "Sai tài khoản hoặc mật khẩu"}), 401

# API Cài đặt tài khoản Admin (Chỉ cần chạy 1 lần)
@app.route('/api/setup-admin', methods=['GET'])
def setup_admin():
    # Kiểm tra xem tài khoản admin đã tồn tại chưa
    res = supabase.table('users').select('*').eq('username', 'admin').execute()
    if len(res.data) > 0:
        return jsonify({"message": "Tài khoản admin đã tồn tại!"}), 200
    
    # Mã hóa mật khẩu 'admin123' và tạo tài khoản
    hashed_password = generate_password_hash("@dta789513!")
    admin_user = {
        "username": "admin",
        "password_hash": hashed_password,
        "role": "admin"
    }
    
    supabase.table('users').insert(admin_user).execute()
    return jsonify({"message": "Đã tạo tài khoản admin thành công! (Tài khoản: admin / Mật khẩu: @dta789513!)"}), 201

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.pop('user', None)
    return jsonify({"message": "Đã đăng xuất"}), 200

# ----- GOOGLE SSO -----
@app.route('/api/auth/google')
def google_login():
    redirect_uri = url_for('google_callback', _external=True)
    google_auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?client_id={GOOGLE_CLIENT_ID}&redirect_uri={redirect_uri}&response_type=code&scope=openid%20email%20profile"
    return redirect(google_auth_url)

@app.route('/api/auth/google/callback')
def google_callback():
    code = request.args.get('code')
    redirect_uri = url_for('google_callback', _external=True)
    
    # Đổi code lấy token
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri
    }
    token_res = requests.post(token_url, data=token_data).json()
    access_token = token_res.get("access_token")
    
    if not access_token:
        return "Lỗi đăng nhập Google", 400
        
    # Lấy thông tin user từ Google
    user_info_res = requests.get("https://www.googleapis.com/oauth2/v2/userinfo", headers={"Authorization": f"Bearer {access_token}"}).json()
    email = user_info_res.get("email")
    name = user_info_res.get("name")
    
    # Kiểm tra user trong DB
    res = supabase.table('users').select('*').eq('email', email).execute()
    if len(res.data) > 0:
        user = res.data[0]
    else:
        # Tự động tạo user mới nếu chưa có
        new_user = {"email": email, "username": email.split('@')[0], "role": "user", "password_hash": ""}
        res_insert = supabase.table('users').insert(new_user).execute()
        user = res_insert.data[0]
        
    session['user'] = {"id": user['id'], "username": user['username'], "role": user['role'], "email": user['email']}
    return redirect('/')

# ==========================================
# CÁC API NGHIỆP VỤ (CÂY & BÀI VIẾT)
# ==========================================
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
    user = session.get('user')
    if not user or user['role'] != 'admin':
        return jsonify({"error": "Không có quyền thực hiện"}), 403
        
    try:
        data = request.json
        if not data.get('parent_id'): data['parent_id'] = None
        response = supabase.table('family_members').upsert(data).execute()
        return jsonify(response.data), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# (Giữ nguyên cụm API /api/articles và /api/search như cũ...)
@app.route('/api/articles', methods=['GET'])
def get_articles():
    response = supabase.table('intro_articles').select('*').execute()
    return jsonify(response.data), 200

@app.route('/api/articles', methods=['POST'])
def add_article():
    user = session.get('user'); 
    if not user or user['role'] != 'admin': return jsonify({"error": "Cấm"}), 403
    data = request.json
    if not data.get('parent_id'): data['parent_id'] = None
    res = supabase.table('intro_articles').insert(data).execute()
    return jsonify({'id': res.data[0]['id'] if res.data else None, 'message': 'Thêm thành công'}), 201

@app.route('/api/articles/<int:id>', methods=['PUT', 'DELETE'])
def modify_article(id):
    user = session.get('user'); 
    if not user or user['role'] != 'admin': return jsonify({"error": "Cấm"}), 403
    if request.method == 'PUT':
        data = request.json
        if not data.get('parent_id'): data['parent_id'] = None
        supabase.table('intro_articles').update(data).eq('id', id).execute()
        return jsonify({'message': 'Cập nhật thành công'}), 200
    elif request.method == 'DELETE':
        supabase.table('intro_articles').delete().eq('parent_id', id).execute()
        supabase.table('intro_articles').delete().eq('id', id).execute()
        return jsonify({'message': 'Xóa thành công'}), 200

@app.route('/api/search', methods=['GET'])
def search_member():
    q = request.args.get('q', '').strip()
    if not q: return jsonify([]), 200
    search_query = f"full_name.ilike.%{q}%,phone.ilike.%{q}%"
    response = supabase.table('family_members').select('*').or_(search_query).execute()
    return jsonify(response.data), 200

# ==========================================
# API YÊU CẦU XÁC NHẬN & CHỈNH SỬA
# ==========================================
@app.route('/api/claims', methods=['POST', 'GET'])
def handle_claims():
    user = session.get('user')
    if not user: return jsonify({"error": "Vui lòng đăng nhập"}), 401
    
    if request.method == 'POST':
        data = request.json
        data['user_id'] = user['id']
        supabase.table('member_claims').insert(data).execute()
        return jsonify({"message": "Đã gửi yêu cầu xác nhận"}), 201
        
    elif request.method == 'GET':
        if user['role'] != 'admin': return jsonify({"error": "Cấm"}), 403
        # Lấy danh sách kèm tên user và tên member
        res = supabase.table('member_claims').select('*, users(username, email), family_members(full_name, generation)').eq('status', 'pending').execute()
        return jsonify(res.data), 200

@app.route('/api/claims/approve/<int:claim_id>', methods=['POST'])
def approve_claim(claim_id):
    user = session.get('user')
    if not user or user['role'] != 'admin': return jsonify({"error": "Cấm"}), 403
    
    claim = supabase.table('member_claims').select('*').eq('id', claim_id).execute().data[0]
    
    # Liên kết user với member
    supabase.table('family_members').update({"linked_user_id": claim['user_id']}).eq('id', claim['member_id']).execute()
    # Cập nhật trạng thái
    supabase.table('member_claims').update({"status": "approved"}).eq('id', claim_id).execute()
    return jsonify({"message": "Đã duyệt"}), 200

@app.route('/api/edit_requests', methods=['POST', 'GET'])
def handle_edit_requests():
    user = session.get('user')
    if not user: return jsonify({"error": "Vui lòng đăng nhập"}), 401
    
    if request.method == 'POST':
        data = request.json
        payload = {
            "user_id": user['id'],
            "member_id": data.pop('member_id'),
            "proposed_data": data
        }
        supabase.table('edit_requests').insert(payload).execute()
        return jsonify({"message": "Đã gửi đề nghị chỉnh sửa cho Admin duyệt"}), 201
        
    elif request.method == 'GET':
        if user['role'] != 'admin': return jsonify({"error": "Cấm"}), 403
        res = supabase.table('edit_requests').select('*, users(username, email), family_members(full_name)').eq('status', 'pending').execute()
        return jsonify(res.data), 200

@app.route('/api/edit_requests/approve/<int:req_id>', methods=['POST'])
def approve_edit(req_id):
    user = session.get('user')
    if not user or user['role'] != 'admin': return jsonify({"error": "Cấm"}), 403
    
    req = supabase.table('edit_requests').select('*').eq('id', req_id).execute().data[0]
    proposed_data = req['proposed_data']
    
    # LOGIC MỚI: Nếu data có chứa 'id' thì là Sửa, nếu không có 'id' thì là Thêm mới
    if 'id' in proposed_data and proposed_data['id']:
        supabase.table('family_members').update(proposed_data).eq('id', proposed_data['id']).execute()
    else:
        supabase.table('family_members').insert(proposed_data).execute()
        
    # Chuyển trạng thái thành đã duyệt
    supabase.table('edit_requests').update({"status": "approved"}).eq('id', req_id).execute()
    return jsonify({"message": "Đã áp dụng thay đổi"}), 200

if __name__ == '__main__':
    app.run(debug=True, port=5000)