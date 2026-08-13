let currentUser = null;
let currentViewingMemberId = null; 
let chart = null;
let familyData = [];
let maxGeneration = 1;
let introArticles = [];
let currentArticleId = null;
let quillEditor = null;

// =====================================
// KHỞI TẠO & XÁC THỰC
// =====================================
document.addEventListener("DOMContentLoaded", async () => {
    await checkAuth(); // Kiểm tra đăng nhập
    initQuill();       // Khởi tạo editor
    loadArticles();    // Tải menu giới thiệu
    loadTree();        // Vẽ cây
});

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        currentUser = data.user;
        renderAuthUI();
    } catch (e) {
        console.error("Lỗi Auth", e);
    }
}

function renderAuthUI() {
    const authBox = document.getElementById('auth-controls');
    if (currentUser) {
        // Thêm id="adminApproveBtn" vào nút để JS có thể tìm và đổi chữ
        let adminBtn = currentUser.role === 'admin' ? `<button id="adminApproveBtn" onclick="openAdminDashboard()" class="bg-red-600 text-white px-3 py-1 text-sm rounded shadow transition">Duyệt Yêu cầu</button>` : '';
        authBox.innerHTML = `
            ${adminBtn}
            <span class="font-bold text-blue-800 text-sm">Xin chào, ${currentUser.username}</span>
            <button onclick="logout()" class="text-sm underline text-gray-500 hover:text-gray-800">Đăng xuất</button>
        `;
        
        // Mở khóa UI cho Admin
        if (currentUser.role === 'admin') {
            document.getElementById('admin-add-menu-btn').classList.remove('hidden');
            document.getElementById('admin-add-root-btn').classList.remove('hidden');
            
            // Gọi hàm đếm số lượng yêu cầu đang chờ duyệt
            updatePendingCount();
            renderAnniversaries();
        }
    } else {
        authBox.innerHTML = `<button onclick="openLoginModal()" class="bg-blue-600 text-white px-4 py-1.5 rounded shadow text-sm font-bold">Đăng Nhập</button>`;
    }
}

// =====================================
// KHỞI TẠO BỘ SOẠN THẢO (QUILL)
// =====================================
function initQuill() {
    try {
        if (document.getElementById('quill-editor')) {
            quillEditor = new Quill('#quill-editor', {
                theme: 'snow',
                placeholder: 'Soạn thảo nội dung ở đây...',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        [{ 'size': ['small', false, 'large', 'huge'] }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'align': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean'] 
                    ]
                }
            });
        }
    } catch (err) {
        console.error("Lỗi khởi tạo bộ soạn thảo:", err);
    }
}

// =====================================
// ĐĂNG NHẬP LOGIC
// =====================================
function openLoginModal() { document.getElementById('loginModal').classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('loginModal').classList.add('hidden'); }

async function handleLogin(e) {
    e.preventDefault();
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: document.getElementById('loginUser').value,
            password: document.getElementById('loginPass').value
        })
    });
    if (res.ok) {
        window.location.reload();
    } else {
        alert("Sai tài khoản hoặc mật khẩu");
    }
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
}

// =====================================
// KIỂM TRA QUYỀN TRÊN CÂY GIA PHẢ
// =====================================
function checkEditPermission(nodeId) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    
    // Dùng == thay vì === để tránh lỗi kiểu dữ liệu (UUID chuỗi vs số)
    let current = familyData.find(d => d.id == nodeId);
    if (!current) return false;
    
    // 1. Cho phép sửa nếu là nút của mình hoặc con cháu mình
    let temp = current;
    while (temp) {
        if (temp.linked_user_id === currentUser.id) return true;
        temp = familyData.find(d => d.id == temp.parent_id);
    }
    
    // 2. MỚI: Cho phép sửa nếu là nút Cha/Mẹ trực tiếp ở đời trước
    const myNode = familyData.find(d => d.linked_user_id === currentUser.id);
    if (myNode && myNode.parent_id == nodeId) {
        return true; 
    }
    
    return false;
}

// Xử lý chuyển Tabs
function switchTab(tabId) {
    document.getElementById('content-intro').classList.add('hidden');
    document.getElementById('content-tree').classList.add('hidden');
    document.getElementById('content-anniv').classList.add('hidden'); // Tab mới

    document.getElementById('tab-intro').classList.remove('tab-active');
    document.getElementById('tab-tree').classList.remove('tab-active');
    document.getElementById('tab-anniv').classList.remove('tab-active'); // Tab mới
    
    document.getElementById(`content-${tabId}`).classList.remove('hidden');
    document.getElementById(`tab-${tabId}`).classList.add('tab-active');
}

function getTitlePrefix(generation, gender) {
    const diff = maxGeneration - generation;
    if (generation === 1) return 'Cụ tổ';
    if (diff === 0 || diff === 1) 
        return gender === 'Nam' ? 'Anh' : 'Chị';
    else if (diff === 2) 
        return gender === 'Nam' ? 'Ông' : 'Bà';
    else
        return gender === 'Nam' ? 'Ông cụ' : 'Bà cụ';
}

async function loadTree() {
    try {
        const res = await fetch('/api/members');
        if (!res.ok) throw new Error(`Lỗi HTTP: ${res.status}`);
        
        familyData = await res.json();
        if (familyData.error) throw new Error(familyData.error);

        if(familyData.length > 0) {
            maxGeneration = Math.max(...familyData.map(d => d.generation));
        } else {
            document.getElementById('tree-container').innerHTML = '<p class="text-center mt-10 text-gray-500">Chưa có dữ liệu gia phả. Hãy thêm Người Mới (Gốc).</p>';
            return;
        }
        
        // Sắp xếp thứ tự các con
        familyData.sort((a, b) => (a.child_order || 1) - (b.child_order || 1));

        // 1. LƯU LẠI TRẠNG THÁI ĐÓNG/MỞ HIỆN TẠI
        let expandedStates = {};
        if (chart) {
            const state = chart.getChartState();
            if (state && state.allNodes) {
                state.allNodes.forEach(n => {
                    expandedStates[n.id] = n.data._expanded !== false;
                });
            }
        }

        let chartData = [];
        
        // 2. CHUẨN BỊ DỮ LIỆU (Nối trực tiếp Cha -> Con, bỏ nhánh phu nhân ảo)
        familyData.forEach(d => {
            chartData.push({
                id: d.id,
                parentId: d.parent_id || "", 
                // Đời 1 Mở, Đời 2 trở đi Đóng
                _expanded: expandedStates.hasOwnProperty(d.id) ? expandedStates[d.id] : (d.generation < 2),
                data: d
            });
        });

        // 3. KHỞI TẠO HOẶC CẬP NHẬT BIỂU ĐỒ
        if (!chart) {
            document.getElementById('tree-container').innerHTML = "";
            chart = new d3.OrgChart()
                .container('.chart-container')
                .data(chartData)
                .nodeId(d => d.id)             
                .parentNodeId(d => d.parentId) 
                .compact(false) 
                .linkUpdate(function (d, i, arr) {
                    d3.select(this)
                        .attr("stroke", d => d.data._upToTheRootHighlighted ? "#2563eb" : "#cbd5e1")
                        .attr("stroke-width", d => d.data._upToTheRootHighlighted ? 4 : 1.5);
                })
                // 1. Tùy chỉnh CHIỀU RỘNG nút
                .nodeWidth(d => {
                    const info = d.data.data;
                    const prefix = getTitlePrefix(info.generation, info.gender);
                    const fullText = prefix + " " + info.full_name;
                    
                    // Nếu là Đời 1: Chiều rộng cơ bản là 220px (nút thường là 180px), tự giãn nếu tên siêu dài
                    if (info.generation === 1) {
                        return Math.max(220, (fullText.length * 10) + 50); 
                    }
                    return Math.max(180, (fullText.length * 8.5) + 40);
                })
                // 2. Tùy chỉnh CHIỀU CAO nút
                .nodeHeight(d => {
                    // Nếu là Đời 1: Cao 125px. Các đời khác: Cao 100px.
                    return d.data.data.generation === 1 ? 125 : 100;
                })
                .childrenMargin(d => 40)
                .nodeContent(function(d, i, arr, state) {
                    const info = d.data.data;
                    const canEdit = checkEditPermission(info.id);
                    const prefix = getTitlePrefix(info.generation, info.gender);
                    const isRoot = info.generation === 1; // Kiểm tra xem có phải Đời 1 không

                    // 1. Phân loại màu nền và viền
                    let bgClass = '';
                    if (isRoot) {
                        bgClass = 'bg-indigo-900 border-indigo-500 shadow-md'; // Nền xanh tím đậm, viền tím sáng
                    } else {
                        bgClass = info.gender === 'Nam' ? 'bg-blue-50 border-blue-300' : 'bg-orange-50 border-orange-300';
                    }

                    // Phân loại kích cỡ và màu chữ (Đời 1 chữ sẽ to hơn)
                    const genTextClass = isRoot ? 'text-indigo-300 text-sm' : 'text-gray-500 text-xs';
                    const nameTextClass = isRoot ? 'text-yellow-400 font-extrabold text-[18px]' : 'text-gray-900 font-bold text-[15px]';
                    
                    // Phân loại kích cỡ nút bấm bên trong
                    const btnSize = isRoot ? 'w-8 h-8' : 'w-7 h-7';
                    const iconSize = isRoot ? 'h-5 w-5' : 'h-4 w-4';

                    // Phân loại màu cho 3 nút chức năng
                    const btnInfoClass = isRoot
                        ? 'bg-indigo-800 border-indigo-600 text-indigo-200 hover:bg-indigo-700 hover:text-white' 
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100 hover:text-blue-600';
                        
                    const btnEditClass = isRoot
                        ? 'bg-indigo-800 border-indigo-600 text-indigo-200 hover:bg-indigo-700 hover:text-yellow-400' 
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-yellow-50 hover:text-yellow-600';
                        
                    const btnAddClass = isRoot
                        ? 'bg-yellow-500 border-yellow-500 text-indigo-900 hover:bg-yellow-400 font-bold' 
                        : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700';

                    if (isRoot) {
                        return `
                            <div class="w-full h-full ${bgClass} border-2 rounded-lg flex flex-col justify-center items-center p-2 relative hover:shadow-lg transition select-none cursor-pointer"
                                onclick="highlightPath('${d.id}')"
                                ondblclick="event.stopPropagation(); toggleNodeCollapse('${d.id}')">
                                
                                <div class="text-[15px] whitespace-nowrap w-full text-center px-2 mb-0 ${nameTextClass} font-name-soft" title="${prefix} ${info.full_name}">
                                    ${prefix.toUpperCase()}
                                </div>
                                
                                <div class="text-[25px] whitespace-nowrap w-full text-center px-2 mb-2 ${nameTextClass} font-name" title="${prefix} ${info.full_name}">
                                        ${info.full_name.toUpperCase()}
                                </div>
                                
                                <div class="mt-auto flex gap-2 justify-center w-full">
                                    <button onclick="event.stopPropagation(); openInfoModal('${info.id}')" class="w-7 h-7 flex items-center justify-center border rounded transition shadow-sm ${btnInfoClass}" title="Xem chi tiết"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                                    ${canEdit ? `<button onclick="event.stopPropagation(); openEditModal('${info.id}')" class="w-7 h-7 flex items-center justify-center border rounded transition shadow-sm ${btnEditClass}" title="Sửa thông tin"><svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>` : ''}
                                    ${canEdit ? `<button onclick="event.stopPropagation(); openModal('${info.id}', ${info.generation})" class="w-7 h-7 flex items-center justify-center border rounded transition shadow-sm ${btnAddClass}" title="Thêm nhánh/con"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg></button>` : ''}
                                </div>
                            </div>
                        `;
                    } else {
                        return `
                            <div class="w-full h-full ${bgClass} border-2 rounded-lg flex flex-col justify-center items-center p-2 relative hover:shadow-xl transition select-none cursor-pointer"
                                onclick="highlightPath('${d.id}')"
                                ondblclick="event.stopPropagation(); toggleNodeCollapse('${d.id}')">
                            
                            <div class="font-bold ${genTextClass} mb-1">Đời thứ ${info.generation}</div>
                            
                            <div class="whitespace-nowrap w-full text-center px-2 mb-2 ${nameTextClass}" title="${prefix} ${info.full_name}">
                                ${prefix} ${info.full_name}
                            </div>
                            
                            <div class="mt-auto flex gap-2 justify-center w-full">
                                <button onclick="event.stopPropagation(); openInfoModal('${info.id}')" class="${btnSize} flex items-center justify-center border rounded transition shadow-sm ${btnInfoClass}" title="Xem chi tiết"><svg xmlns="http://www.w3.org/2000/svg" class="${iconSize}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button>
                                ${canEdit ? `<button onclick="event.stopPropagation(); openEditModal('${info.id}')" class="${btnSize} flex items-center justify-center border rounded transition shadow-sm ${btnEditClass}" title="Sửa thông tin"><svg xmlns="http://www.w3.org/2000/svg" class="${iconSize}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>` : ''}
                                ${canEdit ? `<button onclick="event.stopPropagation(); openModal('${info.id}', ${info.generation})" class="${btnSize} flex items-center justify-center border rounded transition shadow-sm ${btnAddClass}" title="Thêm nhánh/con"><svg xmlns="http://www.w3.org/2000/svg" class="${iconSize}" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg></button>` : ''}
                            </div>
                        </div>
                        `;
                    }
                    
                })
                .render();
        } else {
            chart.data(chartData).render();
        }

        // 4. KIỂM SOÁT CAMERA VÀ TỰ ĐỘNG TÌM NÚT CỦA NGƯỜI DÙNG
        if (Object.keys(expandedStates).length === 0) {
            
            // Tìm xem User hiện tại đã được liên kết với nút nào trên cây chưa
            let myNodeId = null;
            if (currentUser && currentUser.role === 'user') {
                const myNode = familyData.find(d => d.linked_user_id === currentUser.id);
                if (myNode) myNodeId = myNode.id;
            }

            if (myNodeId) {
                // KỊCH BẢN 1: Người dùng đã xác minh -> Tự động Highlight và Zoom tới nút của họ
                // Dùng setTimeout 100ms để đợi thư viện D3 dựng xong khung DOM cơ bản
                setTimeout(() => {
                    applySearchHighlight(myNodeId);
                }, 500);
                
            } else {
                // KỊCH BẢN 2: Chưa xác minh hoặc là Admin -> Căn giữa từ Đời 1 như mặc định
                setTimeout(() => {
                    const state = chart.getChartState();
                    if (!state || !state.allNodes || state.allNodes.length === 0) return;
                    
                    const svg = d3.select(state.svg);
                    const zoom = state.zoomBehavior;
                    
                    let minX = d3.min(state.allNodes, n => n.x - ((n.width || 180) / 2));
                    let maxX = d3.max(state.allNodes, n => n.x + ((n.width || 180) / 2));
                    let minY = d3.min(state.allNodes, n => n.y);
                    let maxY = d3.max(state.allNodes, n => n.y + (n.height || 100));
                    
                    const treeWidth = maxX - minX;
                    const treeHeight = maxY - minY;
                    const treeCenterX = minX + (treeWidth / 2);
                    
                    const padding = 30;
                    const scaleX = (state.svgWidth - padding * 2) / treeWidth;
                    const scaleY = (state.svgHeight - padding * 2) / treeHeight;
                    const scale = Math.min(scaleX, scaleY, 1); 
                    
                    const translateX = (state.svgWidth / 2) - (treeCenterX * scale);
                    const translateY = 50 - (minY * scale);
                    
                    svg.transition().duration(300).call(
                        zoom.transform, 
                        d3.zoomIdentity.translate(translateX, translateY).scale(scale)
                    );
                    
                }, 250);
                
                chart.fit();
            }
        }
        renderAnniversaries();
    } catch (error) {
        console.error("Lỗi hệ thống chi tiết:", error);
        document.getElementById('tree-container').innerHTML = `
            <div class="text-center mt-10">
                <p class="text-red-500 font-bold text-lg">Lỗi không thể tải dữ liệu.</p>
                <p class="text-gray-500 text-sm mt-2">Chi tiết lỗi: ${error.message}</p>
            </div>
        `;
    }
}

function toggleDeathDates() {
    const isAlive = document.getElementById('isAlive').checked;
    document.getElementById('deathDates').classList.toggle('hidden', isAlive);
}

function openModal(parentId = null, parentGen = 0) {
    document.getElementById('memberId').value = "";
    document.getElementById('memberForm').reset();
    document.getElementById('parentId').value = parentId || "";
    
    const motherContainer = document.getElementById('motherNameContainer');
    if (parentId) {
        motherContainer.classList.remove('hidden');
        document.getElementById('motherName').required = true;
        document.getElementById('generation').value = parentGen + 1;
        document.getElementById('modalTitle').innerText = "Thêm Con/Cháu";
        
        const existingChildren = familyData.filter(d => d.parent_id === parentId);
        const orderEl = document.getElementById('childOrder');
        if(orderEl) orderEl.value = existingChildren.length + 1;
    } else {
        motherContainer.classList.add('hidden');
        document.getElementById('motherName').required = false;
        document.getElementById('generation').value = maxGeneration + 1;
        document.getElementById('modalTitle').innerText = "Thêm Người Mới (Gốc)";
        const orderEl = document.getElementById('childOrder');
        if(orderEl) orderEl.value = 1;
    }

    // Ép checkbox về trạng thái không tích
    const isAliveCb = document.getElementById('isAlive');
    if(isAliveCb) isAliveCb.checked = false;

    toggleDeathDates();
    document.getElementById('memberModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('memberModal').classList.add('hidden');
}

async function saveMember(e) {
    e.preventDefault();
    const memberId = document.getElementById('memberId')?.value;

    const data = {
        full_name: document.getElementById('fullName')?.value || "",
        generation: parseInt(document.getElementById('generation')?.value || 1),
        gender: document.getElementById('gender')?.value || "Nam",
        dob: document.getElementById('dob')?.value || "",
        parent_id: document.getElementById('parentId')?.value || null,
        mother_name: document.getElementById('motherName')?.value || null,
        spouse_name: document.getElementById('spouse')?.value || "",
        spouse_dob: document.getElementById('spouseDob')?.value || "",
        spouse_dod_solar: document.getElementById('spouseDodSolar')?.value || "",
        spouse_dod_lunar: document.getElementById('spouseDodLunar')?.value || "",
        spouse_father_name: document.getElementById('spouseFatherName')?.value || "",
        spouse_father_dob: document.getElementById('spouseFatherDob')?.value || "",
        spouse_father_dod_solar: document.getElementById('spouseFatherDodSolar')?.value || "",
        spouse_father_dod_lunar: document.getElementById('spouseFatherDodLunar')?.value || "",
        spouse_mother_name: document.getElementById('spouseMotherName')?.value || "",
        spouse_mother_dob: document.getElementById('spouseMotherDob')?.value || "",
        spouse_mother_dod_solar: document.getElementById('spouseMotherDodSolar')?.value || "",
        spouse_mother_dod_lunar: document.getElementById('spouseMotherDodLunar')?.value || "",
        is_alive: document.getElementById('isAlive')?.checked || false,
        dod_solar: document.getElementById('dodSolar')?.value || "",
        dod_lunar: document.getElementById('dodLunar')?.value || "",
        phone: document.getElementById('phone')?.value || "",
        address: document.getElementById('address')?.value || "",
        other_info: document.getElementById('otherInfo')?.value || "",
        child_order: parseInt(document.getElementById('childOrder')?.value || 1)
    };

    if (memberId) {
        data.id = memberId;
    }

    // Khai báo biến res ở ngoài cùng để tất cả các khối lệnh đều dùng chung được
    let res; 

    if (currentUser.role === 'admin') {
        // ADMIN LƯU TRỰC TIẾP
        res = await fetch('/api/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            // --- ĐỒNG BỘ TÊN MẸ CHO CÁC CON ---
            const newSpouse = document.getElementById('spouse')?.value || "";
            const oldSpouse = document.getElementById('oldSpouse')?.value || "";
            if (memberId && newSpouse !== oldSpouse) {
                const childrenToUpdate = familyData.filter(d => 
                    d.parent_id == memberId && (d.mother_name === oldSpouse || !d.mother_name)
                );
                if (childrenToUpdate.length > 0) {
                    for (let child of childrenToUpdate) {
                        child.mother_name = newSpouse;
                        await fetch('/api/members', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(child)
                        });
                    }
                }
            }

            // --- XỬ LÝ LƯU VÀ NHẬP TIẾP (ADMIN) ---
            if (window.isContinue) {
                loadTree(); // Vẽ lại cây ngầm
                if(document.getElementById('memberId')) document.getElementById('memberId').value = "";
                
                // Xóa trắng form
                ['fullName', 'dob', 'spouse', 'spouseDob', 'spouseDodSolar', 'spouseDodLunar', 'spouseFatherName', 'spouseFatherDob', 'spouseFatherDodSolar', 'spouseFatherDodLunar', 'spouseMotherName', 'spouseMotherDob', 'spouseMotherDodSolar', 'spouseMotherDodLunar', 'phone', 'address', 'otherInfo', 'dodSolar', 'dodLunar'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = "";
                });
                
                // Tăng con thứ
                const orderEl = document.getElementById('childOrder');
                if(orderEl) orderEl.value = parseInt(orderEl.value || 0) + 1;
                document.getElementById('fullName')?.focus();
            } else {
                closeModal();
                loadTree();
            }
        } else {
            const err = await res.json();
            alert("Lỗi khi lưu thông tin: " + (err.error || "Lỗi máy chủ"));
        }

    } else {
        // USER GỬI ĐỀ NGHỊ SỬA / THÊM
        data.member_id = memberId || data.parent_id;
        res = await fetch('/api/edit_requests', { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(data) 
        });

        if (res.ok) {
            alert("Đã gửi Đề nghị thay đổi cho Admin duyệt!");
            
            // --- XỬ LÝ LƯU VÀ NHẬP TIẾP (USER) ---
            // User chỉ được nhập tiếp nếu đang Thêm con mới (chứ không phải đang sửa)
            if (window.isContinue && !memberId) {
                ['fullName', 'dob', 'spouse', 'spouseDob', 'spouseDodSolar', 'spouseDodLunar', 'spouseFatherName', 'spouseFatherDob', 'spouseFatherDodSolar', 'spouseFatherDodLunar', 'spouseMotherName', 'spouseMotherDob', 'spouseMotherDodSolar', 'spouseMotherDodLunar', 'phone', 'address', 'otherInfo', 'dodSolar', 'dodLunar'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = "";
                });
                const orderEl = document.getElementById('childOrder');
                if(orderEl) orderEl.value = parseInt(orderEl.value || 0) + 1;
                document.getElementById('fullName')?.focus();
            } else {
                closeModal();
            }
        } else {
            const err = await res.json();
            alert("Lỗi khi gửi yêu cầu: " + (err.error || "Lỗi máy chủ"));
        }
    }
}

// Hàm đóng/mở nhánh khi click đúp
function toggleNodeCollapse(nodeId) {
    // Xóa vùng bôi đen khi nháy đúp
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    // BƯỚC 1: XỬ LÝ THEO ĐÚNG TƯ DUY CỦA BẠN
    // Dùng d3 để tìm đúng Node đang được nháy đúp
    const nodeSelection = d3.selectAll('.node').filter(d => d.id === nodeId || (d.data && d.data.id === nodeId));
    
    // Tìm nút mũi tên (có class .node-button-g) bên trong Node đó
    const arrowButton = nodeSelection.select('.node-button-g').node();

    if (arrowButton) {
        // Giả lập sự kiện click chuột trái vào nút mũi tên
        // Thư viện sẽ bị đánh lừa là người dùng vừa bấm vào mũi tên và tự chạy Animation thu gọn/mở rộng!
        arrowButton.dispatchEvent(new Event('click'));
    } else {
        // BƯỚC 2: DỰ PHÒNG (Trường hợp bản thân người đó chưa có con nên không có nút mũi tên)
        // Sử dụng API chuẩn của thư viện để đảo trạng thái
        if (typeof chart.setExpanded === 'function') {
            const node = chart.getChartState().allNodes.find(n => n.id === nodeId);
            if (node) {
                const isExpanded = node.data._expanded !== false; 
                chart.setExpanded(nodeId, !isExpanded).render();
            }
        }
    }
}

// Hàm mở form và đổ dữ liệu cũ vào để Sửa
function openEditModal(memberId) {
    const member = familyData.find(d => d.id === memberId);
    if (!member) return;

    document.getElementById('memberForm').reset();
    document.getElementById('memberId').value = member.id;
    document.getElementById('parentId').value = member.parent_id || "";
    const prefix = getTitlePrefix(member.generation, member.gender);
    document.getElementById('modalTitle').innerText = `Sửa thông tin ${prefix} ${member.full_name}`;
    
    document.getElementById('fullName').value = member.full_name || "";
    document.getElementById('generation').value = member.generation || "";
    
    const orderEl = document.getElementById('childOrder');
    if(orderEl) orderEl.value = member.child_order || 1;
    
    // Xử lý ô Tên Mẹ (Mẹ của người đang được sửa - Dành cho các con)
    const motherContainer = document.getElementById('motherNameContainer');
    if (member.parent_id) {
        motherContainer.classList.remove('hidden');
        document.getElementById('motherName').required = true;
        document.getElementById('motherName').value = member.mother_name || "";
    } else {
        motherContainer.classList.add('hidden');
        document.getElementById('motherName').required = false;
        document.getElementById('motherName').value = "";
    }

    document.getElementById('gender').value = member.gender || "Nam";
    document.getElementById('dob').value = member.dob || "";
    
    // --- TỰ ĐỘNG TÍNH TOÁN TÊN VỢ ---
    // Lấy tên vợ cũ đã lưu (nếu có)
    let spouseName = member.spouse_name || "";
    
    // Tìm tất cả các CON của người đang sửa
    const children = familyData.filter(d => d.parent_id === member.id);
    // Gom tên MẸ của các con lại (loại bỏ trùng lặp)
    const wives = [...new Set(children.map(c => c.mother_name).filter(Boolean))];
    
    // Nối tên các người vợ vào ô Vợ/Chồng
    if (wives.length > 0) {
        wives.forEach(w => {
            if (!spouseName.includes(w)) {
                spouseName = spouseName ? spouseName + ", " + w : w;
            }
        });
    }
    document.getElementById('spouse').value = spouseName;
    const oldSpouseEl = document.getElementById('oldSpouse');
    if(oldSpouseEl) oldSpouseEl.value = spouseName;
    // ---------------------------------
    const phoneEl = document.getElementById('phone');
    if(phoneEl) phoneEl.value = member.phone || "";
    const addressEl = document.getElementById('address');
    if(addressEl) addressEl.value = member.address || "";
    const infoEl = document.getElementById('otherInfo');
    if(infoEl) infoEl.value = member.other_info || "";
    
    const isAliveCb = document.getElementById('isAlive');
    if(isAliveCb) {
        isAliveCb.checked = member.is_alive;
        toggleDeathDates();
    }

    document.getElementById('dodSolar').value = member.dod_solar || "";
    document.getElementById('dodLunar').value = member.dod_lunar || "";
    document.getElementById('spouseDob').value = member.spouse_dob || "";
    document.getElementById('spouseDodSolar').value = member.spouse_dod_solar || "";
    document.getElementById('spouseDodLunar').value = member.spouse_dod_lunar || "";
    document.getElementById('spouseFatherName').value = member.spouse_father_name || "";
    document.getElementById('spouseFatherDob').value = member.spouse_father_dob || "";
    document.getElementById('spouseFatherDodSolar').value = member.spouse_father_dod_solar || "";
    document.getElementById('spouseFatherDodLunar').value = member.spouse_father_dod_lunar || "";
    document.getElementById('spouseMotherName').value = member.spouse_mother_name || "";
    document.getElementById('spouseMotherDob').value = member.spouse_mother_dob || "";
    document.getElementById('spouseMotherDodSolar').value = member.spouse_mother_dod_solar || "";
    document.getElementById('spouseMotherDodLunar').value = member.spouse_mother_dod_lunar || "";

    document.getElementById('memberModal').classList.remove('hidden');
}
let currentHighlightedNodeId = null;

// Hàm tô đậm đường dẫn từ Gốc đến Nút được chọn
function highlightPath(nodeId) {
    // Xóa vùng bôi đen chữ vô tình bị quét trúng
    if (window.getSelection) {
        window.getSelection().removeAllRanges();
    }

    if (chart) {
        if (currentHighlightedNodeId === nodeId) {
            // Nếu bấm lại chính nút đó -> Tắt highlight
            chart.clearHighlighting();
            currentHighlightedNodeId = null;
        } else {
            // Bấm nút mới -> Xóa highlight cũ, bật highlight nhánh mới
            chart.clearHighlighting();
            chart.setUpToTheRootHighlighted(nodeId);
            currentHighlightedNodeId = nodeId;
        }
        
        // Vẽ lại cây để áp dụng màu
        chart.render();
    }
}
// Mở Form hiển thị chi tiết (Read-only)
function openInfoModal(memberId) {
    currentViewingMemberId = memberId;
    const member = familyData.find(d => d.id === memberId);
    if (!member) return;

    const prefix = getTitlePrefix(member.generation, member.gender);
    const statusHtml = member.is_alive 
        ? `<span class="text-green-600 font-bold">Còn sống</span>` 
        : `<span class="text-gray-500 font-bold">Đã mất</span> 
            <br/>- Ngày mất (Dương lịch): ${member.dod_solar || 'Không rõ'}
            <br/>- Ngày mất (Âm lịch): ${member.dod_lunar || 'Không rõ'}`;

            // THÊM LOGIC KIỂM TRA GIỚI TÍNH CỦA CHA/MẸ
    let parentLabel = "Mẹ"; // Mặc định là Mẹ
    if (member.parent_id) {
        // Dò ngược lên tìm nút phụ huynh
        const parentNode = familyData.find(d => d.id == member.parent_id);
        // Nếu nút phụ huynh là Nữ, thì người phối ngẫu (lưu trong mother_name) chính là Bố
        if (parentNode && parentNode.gender === 'Nữ') {
            parentLabel = "Bố";
        }
    }

    document.getElementById('infoContent').innerHTML = `
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Họ và tên:</span> <span class="col-span-2 font-bold text-base text-blue-700">${prefix} ${member.full_name}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Đời thứ:</span> <span class="col-span-2">${member.generation} ${member.child_order ? `(Con thứ ${member.child_order})` : ''}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Giới tính:</span> <span class="col-span-2">${member.gender}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Ngày sinh:</span> <span class="col-span-2">${member.dob || 'Đang cập nhật'}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">${parentLabel}:</span> <span class="col-span-2">${member.mother_name || 'Không rõ'}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">${member.gender === 'Nam' ? 'Vợ' : 'Chồng'}:</span>${!member.spouse_name ? `<span class="col-span-2">Không rõ</span>` : `<div class="col-span-2 bg-blue-50 p-3 rounded-lg text-sm border border-blue-100"><div class="font-bold text-blue-800 text-base mb-1">${member.spouse_name}</div>${member.spouse_dob ? `<div>- Sinh: ${member.spouse_dob}</div>` : ''}${member.spouse_dod_solar || member.spouse_dod_lunar ? `<div>- Mất: ${member.spouse_dod_solar ? member.spouse_dod_solar + ' (Dương)' : ''} ${member.spouse_dod_lunar ? member.spouse_dod_lunar + ' (Âm)' : ''}</div>` : ''}${(member.spouse_father_name || member.spouse_mother_name) ? `<div class="mt-3 font-bold text-gray-700 border-t border-dashed border-blue-200 pt-2">Thông tin Tứ thân phụ mẫu:</div>` : ''}${member.spouse_father_name ? `<div class="mt-1"><span class="font-medium text-blue-700">Ông:</span> ${member.spouse_father_name}${member.spouse_father_dob ? `(Sinh: ${member.spouse_father_dob})` : ''}${member.spouse_father_dod_solar || member.spouse_father_dod_lunar ? `<br> ↳ Mất: ${member.spouse_father_dod_solar || ''} ${member.spouse_father_dod_lunar ? `(${member.spouse_father_dod_lunar} Âm)` : ''}` : ''}</div>` : ''}${member.spouse_mother_name ? `<div class="mt-2"><span class="font-medium text-blue-700">Bà:</span> ${member.spouse_mother_name}${member.spouse_mother_dob ? `(Sinh: ${member.spouse_mother_dob})` : ''}${member.spouse_mother_dod_solar || member.spouse_mother_dod_lunar ? `<br> ↳ Mất: ${member.spouse_mother_dod_solar || ''} ${member.spouse_mother_dod_lunar ? `(${member.spouse_mother_dod_lunar} Âm)` : ''}` : ''}</div>` : ''}</div>`}</div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Số điện thoại:</span> <span class="col-span-2">${member.phone || 'Chưa cập nhật'}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Địa chỉ:</span> <span class="col-span-2">${member.address || 'Chưa cập nhật'}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Tình trạng:</span> <span class="col-span-2">${statusHtml}</span></div>
        <div class="grid grid-cols-3 gap-2 border-b pb-2"><span class="font-medium col-span-1">Thông tin khác:</span> <span class="col-span-2 whitespace-pre-wrap">${member.other_info || ''}</span></div>
    `;
    
    // Nếu nút này chưa có ai quản lý và user đang đăng nhập (không phải admin)
    const claimSection = document.getElementById('claim-section');
    if (claimSection) {
        // Kiểm tra xem User này đã nhận quyền sở hữu nút nào trên cây chưa?
        let hasClaimedNode = false;
        if (currentUser && currentUser.role === 'user') {
            hasClaimedNode = familyData.some(d => d.linked_user_id === currentUser.id);
        }
        
        // Chỉ hiện nút Claim khi thỏa mãn ĐỒNG THỜI 3 điều kiện:
        // là user thường, nút này chưa có ai quản lý, bản thân User CHƯA TỪNG nhận nút nào khác
        if (currentUser && currentUser.role === 'user' && !member.linked_user_id && !hasClaimedNode) {
            claimSection.classList.remove('hidden');
        } else {
            claimSection.classList.add('hidden');
        }
    }
    document.getElementById('infoModal').classList.remove('hidden');
}

// Đóng Form hiển thị chi tiết
function closeInfoModal() {
    document.getElementById('infoModal').classList.add('hidden');
}
function openClaimModal() {
    closeInfoModal();
    document.getElementById('claimModal').classList.remove('hidden');
}
function closeClaimModal() { 
    document.getElementById('claimModal').classList.add('hidden'); 
}

async function submitClaim(e) {
    e.preventDefault();
    const data = {
        member_id: currentViewingMemberId,
        request_phone: document.getElementById('claimPhone').value,
        request_email: document.getElementById('claimEmail').value,
        notes: document.getElementById('claimNotes').value
    };
    const res = await fetch('/api/claims', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data) });
    if (res.ok) {
        alert("Đã gửi yêu cầu xác nhận cho Admin!");
        closeClaimModal();
    }
}

let lastSearchResults = []; // Biến toàn cục để lưu trữ kết quả tìm kiếm

// 1. Hàm thực hiện tìm kiếm
async function searchMember() {
    const q = document.getElementById('searchInput').value.trim();
    const resultsDiv = document.getElementById('search-results');
    const btnResults = document.getElementById('btnShowResults');
    
    if (!q) {
        clearSearch();
        return;
    }

    resultsDiv.innerHTML = "Đang tìm kiếm...";
    
    try {
        // Gọi API backend (encodeURIComponent giúp xử lý dấu tiếng Việt chuẩn hơn)
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        lastSearchResults = await res.json();
        
        if (lastSearchResults.length === 0) {
            resultsDiv.innerHTML = "Không tìm thấy người nào phù hợp.";
            btnResults.classList.add('hidden');
        } else if (lastSearchResults.length === 1) {
            // CÓ 1 KẾT QUẢ: Tự động vẽ Highlight và thu phóng tới nút đó
            resultsDiv.innerHTML = `Tìm thấy 1 kết quả. <button onclick="clearSearch()" class="underline text-red-500 ml-2 font-medium">Xóa tìm kiếm</button>`;
            btnResults.classList.add('hidden');
            
            applySearchHighlight(lastSearchResults[0].id);
        } else {
            // CÓ NHIỀU KẾT QUẢ: Mở Popup và hiện nút "Kết quả"
            resultsDiv.innerHTML = `Tìm thấy ${lastSearchResults.length} kết quả. <button onclick="clearSearch()" class="underline text-red-500 ml-2 font-medium">Xóa tìm kiếm</button>`;
            btnResults.classList.remove('hidden');
            openSearchResultsModal();
        }
    } catch (error) {
        resultsDiv.innerHTML = "Lỗi hệ thống khi tìm kiếm.";
        console.error(error);
    }
}

// 2. Hàm kích hoạt Highlight và THU GỌN CÁC NHÁNH KHÁC
function applySearchHighlight(nodeId) {
    if (chart) {
        const state = chart.getChartState();
        
        // BƯỚC 1: Lần ngược từ nút kết quả lên gốc để lấy danh sách ID của Cha, Ông, Cố...
        const pathIds = new Set();
        let currentNode = state.allNodes.find(n => n.id === nodeId);
        
        while (currentNode && currentNode.parent) {
            pathIds.add(currentNode.parent.id);
            currentNode = currentNode.parent;
        }

        // BƯỚC 2: Duyệt qua toàn bộ các nút trên cây
        state.allNodes.forEach(n => {
            // Nếu là tổ tiên của nút kết quả -> Mở nhánh (để nhìn thấy nút kết quả)
            if (pathIds.has(n.id)) {
                n.data._expanded = true; 
            } 
            // Nếu không phải tổ tiên (nhánh phụ, hoặc con của nút kết quả) -> Thu gọn lại
            else {
                n.data._expanded = false; 
            }
        });

        // BƯỚC 3: Vẽ nét đậm, tô màu đường dẫn
        chart.clearHighlighting();
        chart.setUpToTheRootHighlighted(nodeId);
        currentHighlightedNodeId = nodeId;
        
        // Dùng render để áp dụng việc thu gọn
        chart.render();
        
        // BƯỚC 4: Tính toán lại kích thước cây và phóng to (zoom in) vừa khít màn hình
        // Sử dụng setTimeout nhỏ để chờ animation thu gọn của d3 chạy xong rồi mới đo đạc
        setTimeout(() => {
            chart.fit();
        }, 200);
    }
}

// 3. Hàm mở Modal hiển thị danh sách nhiều kết quả
function openSearchResultsModal() {
    const listDiv = document.getElementById('searchResultsList');
    listDiv.innerHTML = "";
    
    lastSearchResults.forEach(member => {
        const prefix = getTitlePrefix(member.generation, member.gender);
        const infoList = [];
        if (member.dob) infoList.push(`Sinh: ${member.dob}`);
        if (member.phone) infoList.push(`SĐT: ${member.phone}`);
        
        const infoText = infoList.length > 0 ? `<div class="text-xs text-gray-500 mt-1">${infoList.join(' | ')}</div>` : '';

        // Bấm vào 1 dòng -> Đóng modal & vẽ đường dẫn
        listDiv.innerHTML += `
            <div class="p-3 border rounded-lg hover:bg-blue-50 cursor-pointer transition border-gray-200 mb-2"
                    onclick="selectSearchResult('${member.id}')">
                <div class="font-bold text-blue-700">${prefix} ${member.full_name} <span class="text-xs font-normal text-gray-600 ml-1">(Đời thứ ${member.generation})</span></div>
                ${infoText}
            </div>
        `;
    });
    document.getElementById('searchResultsModal').classList.remove('hidden');
}

// 4. Các hàm bổ trợ
function closeSearchResultsModal() {
    document.getElementById('searchResultsModal').classList.add('hidden');
}

function selectSearchResult(nodeId) {
    closeSearchResultsModal();
    applySearchHighlight(nodeId);
}

function clearSearch() {
    document.getElementById('searchInput').value = "";
    document.getElementById('search-results').innerHTML = "";
    document.getElementById('btnShowResults').classList.add('hidden');
    lastSearchResults = [];
    
    if (chart) {
        chart.clearHighlighting();
        currentHighlightedNodeId = null;
        
        // Khi xóa tìm kiếm, tự động bung mở lại tất cả các đời cho dễ nhìn tổng quan
        chart.expandAll(); 
        chart.fit(); 
    }
}

// ==========================================
// KHU VỰC TAB GIỚI THIỆU (MENU & EDITOR)
// ==========================================
// 1. Khởi tạo Quill Editor & Tải dữ liệu khi mở trang
document.addEventListener("DOMContentLoaded", () => {
    // Dùng try-catch để bảo vệ an toàn, tránh việc lỗi thư viện làm sập các hàm khác
    try {
        if (document.getElementById('quill-editor')) {
            quillEditor = new Quill('#quill-editor', {
                theme: 'snow',
                placeholder: 'Soạn thảo nội dung ở đây...',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        [{ 'size': ['small', false, 'large', 'huge'] }],
                        [{ 'color': [] }, { 'background': [] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'align': [] }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean'] 
                    ]
                }
            });
        }
    } catch (err) {
        console.error("Lỗi khởi tạo bộ soạn thảo:", err);
    }
    
    // Gọi hàm tải menu
    loadArticles();
});

// 3. Tải danh sách bài viết từ API
async function loadArticles() {
    try {
        console.log("Đang gọi API lấy danh mục...");
        const res = await fetch('/api/articles');
        
        if (res.ok) {
            introArticles = await res.json();
            console.log("Dữ liệu danh mục trả về từ Supabase:", introArticles); 
            
            if (introArticles && introArticles.length > 0) {
                renderArticleMenu();
                updateParentSelect();
            } else {
                console.warn("⚠️ API không có lỗi nhưng trả về mảng rỗng. Kiểm tra lại dữ liệu trong bảng intro_articles trên Supabase.");
            }
        } else {
            console.error("❌ API trả về mã lỗi HTTP:", res.status);
        }
    } catch (e) {
        console.error("❌ Lỗi mạng hoặc lỗi kết nối khi tải bài viết:", e);
    }
}

// 2. Logic Thu gọn / Mở rộng Cột 1 (Sidebar)
function toggleIntroSidebar() {
    const sidebar = document.getElementById('intro-sidebar');
    const contentArea = document.getElementById('intro-content-area');
    const btnExpand = document.getElementById('btn-expand-sidebar');

    if (sidebar.classList.contains('w-[30%]')) {
        // Thu gọn
        sidebar.classList.replace('w-[30%]', 'w-0');
        sidebar.style.overflow = 'hidden';
        sidebar.style.opacity = '0';
        contentArea.classList.replace('w-[70%]', 'w-full');
        setTimeout(() => btnExpand.classList.remove('hidden'), 300);
    } else {
        // Mở rộng
        btnExpand.classList.add('hidden');
        sidebar.classList.replace('w-0', 'w-[30%]');
        sidebar.style.opacity = '1';
        contentArea.classList.replace('w-full', 'w-[70%]');
        setTimeout(() => sidebar.style.overflow = 'visible', 300);
    }
}

// 3. Tải danh sách bài viết từ API
async function loadArticles() {
    try {
        const res = await fetch('/api/articles');
        if (res.ok) {
            introArticles = await res.json();
            renderArticleMenu();
            updateParentSelect();
        }
    } catch (e) {
        console.error("Lỗi tải bài viết:", e);
    }
}

// 4. Vẽ Menu đa cấp ra giao diện
function renderArticleMenu() {
    const menuContainer = document.getElementById('article-menu');
    menuContainer.innerHTML = '';
    
    // Lấy các mục gốc (Không có parent_id)
    const parents = introArticles.filter(a => !a.parent_id).sort((a,b) => a.order_num - b.order_num);
    
    parents.forEach(p => {
        const pDiv = document.createElement('div');
        const isSelected = p.id === currentArticleId ? 'bg-blue-800 text-white' : 'text-blue-50 hover:bg-blue-700';
        
        pDiv.innerHTML = `
            <div class="font-bold text-sm p-2 cursor-pointer rounded flex justify-between items-center transition ${isSelected}" onclick="viewArticle(${p.id})">
                <div class="flex items-center gap-2 overflow-hidden">
                    <span class="break-words">${p.title}</span>
                </div>
                <div class="flex gap-2 shrink-0 ml-2">
                    <!--<button onclick="event.stopPropagation(); editMenu(${p.id})" class="text-yellow-300 hover:text-yellow-400" title="Sửa">✏️</button>
                    <button onclick="event.stopPropagation(); deleteMenu(${p.id})" class="text-red-300 hover:text-red-400" title="Xóa">❌</button>-->
                </div>
            </div>
        `;
        menuContainer.appendChild(pDiv);
        
        // Lấy các mục con
        const children = introArticles.filter(a => a.parent_id === p.id).sort((a,b) => a.order_num - b.order_num);
        if (children.length > 0) {
            const cDiv = document.createElement('div');
            // Thụt lề cho menu con và thêm viền kẻ dọc bên trái để phân biệt
            cDiv.className = "pl-2 space-y-1 ml-2 mb-2 mt-1";
            children.forEach(c => {
                const childSelected = c.id === currentArticleId ? 'bg-blue-800 text-white font-bold' : 'text-blue-100 hover:bg-blue-700';
                const childEl = document.createElement('div');
                childEl.innerHTML = `
                    <div class="text-sm p-1 cursor-pointer rounded transition flex justify-between items-center ${childSelected}" onclick="viewArticle(${c.id})">
                        <span class="break-words pr-2">${c.title}</span>
                        <div class="flex gap-2 shrink-0">
                            <!--<button onclick="event.stopPropagation(); editMenu(${c.id})" class="text-yellow-300 hover:text-yellow-400" title="Sửa">✏️</button>
                            <button onclick="event.stopPropagation(); deleteMenu(${c.id})" class="text-red-300 hover:text-red-400" title="Xóa">❌</button>-->
                        </div>
                    </div>
                `;
                cDiv.appendChild(childEl);
            });
            menuContainer.appendChild(cDiv);
        }
    });
}

// 5. Đổ dữ liệu vào combobox chọn "Phần" khi thêm mới
function updateParentSelect() {
    const select = document.getElementById('edit-parent');
    select.innerHTML = '<option value="">-- Cấp lớn nhất (Phần) --</option>';
    // Chỉ cho phép chọn mục gốc làm cha
    const parents = introArticles.filter(a => !a.parent_id).sort((a,b) => a.order_num - b.order_num);
    parents.forEach(p => {
        select.innerHTML += `<option value="${p.id}">${p.title}</option>`;
    });
}

// 6. Chuyển đổi các màn hình (Xem / Sửa / Trống)
function switchArticleScreen(screenName) {
    document.getElementById('article-empty').classList.add('hidden');
    document.getElementById('article-view').classList.add('hidden');
    document.getElementById('article-edit').classList.add('hidden');
    
    if(screenName) document.getElementById(screenName).classList.remove('hidden');
}

// 7. Click Xem nội dung
function viewArticle(id) {
    currentArticleId = id;
    renderArticleMenu(); // Render lại để highlight màu menu đang chọn
    const article = introArticles.find(a => a.id === id);
    
    switchArticleScreen('article-view');
    document.getElementById('view-title').innerText = article.title;
    
    const contentArea = document.getElementById('view-content');
    contentArea.innerHTML = '';

    // Kiểm tra xem đây là menu cha hay menu con
    if (!article.parent_id) {
        let htmlContent = '';
        
        // In nội dung của chính menu cha (nếu có nhập)
        if (article.content && article.content.trim() !== '' && article.content !== '<p><br></p>') {
            htmlContent += `<div class="mb-6">${article.content}</div>`;
        }

        // Lấy toàn bộ các menu con thuộc menu cha này và sắp xếp theo order_num
        const children = introArticles.filter(a => a.parent_id === id).sort((a,b) => a.order_num - b.order_num);
        
        if (children.length > 0) {
            children.forEach(c => {
                // QUAN TRỌNG: Viết liền mạch trên 1 dòng, KHÔNG ấn Enter xuống dòng hay Tab thụt lề ở giữa 2 dấu ` `
                htmlContent += `<div class="mb-4"><h3 class="font-bold text-blue-700 mb-2" style="font-size: 15px;">${c.title}</h3><div>${c.content || '<p class="text-gray-400 italic">Chưa có nội dung...</p>'}</div></div>`;
            });
        } else if (!htmlContent) {
            htmlContent = '<p class="text-gray-400 italic mt-4">Chưa có nội dung cho phần này...</p>';
        }
        
        contentArea.innerHTML = htmlContent;
    } else {
        // Nếu click trực tiếp vào menu con, chỉ hiển thị nội dung của riêng nó
        contentArea.innerHTML = article.content || '<p class="text-gray-400 italic mt-4">Chưa có nội dung cho mục này...</p>';
    }
}

// 8. Nút Thêm Mới
function openArticleEditor() {
    document.getElementById('edit-id').value = "";
    document.getElementById('edit-title').value = "";
    document.getElementById('edit-parent').value = "";
    document.getElementById('edit-order').value = introArticles.length + 1;
    quillEditor.root.innerHTML = ""; // Xóa trắng editor
    
    switchArticleScreen('article-edit');
}

// 9. Nút Sửa hiện tại
function editCurrentArticle() {
    if(!currentArticleId) return;
    const article = introArticles.find(a => a.id === currentArticleId);
    
    document.getElementById('edit-id').value = article.id;
    document.getElementById('edit-title').value = article.title;
    document.getElementById('edit-parent').value = article.parent_id || "";
    document.getElementById('edit-order').value = article.order_num || 0;
    quillEditor.root.innerHTML = article.content || ""; // Bơm nội dung HTML vào editor
    
    switchArticleScreen('article-edit');
}

function cancelArticleEdit() {
    if (currentArticleId) viewArticle(currentArticleId);
    else switchArticleScreen('article-empty');
}

// 10. Lưu dữ liệu (Thêm hoặc Sửa)
async function saveArticle() {
    const id = document.getElementById('edit-id').value;
    const data = {
        title: document.getElementById('edit-title').value,
        parent_id: document.getElementById('edit-parent').value || null,
        order_num: parseInt(document.getElementById('edit-order').value || 0),
        content: quillEditor.root.innerHTML // Lấy mã HTML từ Quill
    };

    if (!data.title) {
        alert("Vui lòng nhập tiêu đề!");
        return;
    }

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/articles/${id}` : '/api/articles';

    try {
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (res.ok) {
            const result = await res.json();
            await loadArticles();
            viewArticle(id ? parseInt(id) : result.id); // Chuyển về màn hình Xem
        }
    } catch (e) {
        alert("Lỗi khi lưu: " + e.message);
    }
}

// 11. Xóa
async function deleteCurrentArticle() {
    if(!currentArticleId) return;
    if(!confirm("Bạn có chắc muốn xóa mục này? (Các mục con bên trong cũng sẽ bị xóa)")) return;

    try {
        const res = await fetch(`/api/articles/${currentArticleId}`, { method: 'DELETE' });
        if (res.ok) {
            currentArticleId = null;
            await loadArticles();
            switchArticleScreen('article-empty');
        }
    } catch (e) {
        alert("Lỗi khi xóa: " + e.message);
    }
}

// Hàm hỗ trợ Sửa trực tiếp từ danh sách menu
function editMenu(id) {
    currentArticleId = id;
    editCurrentArticle();
}

// Hàm hỗ trợ Xóa trực tiếp từ danh sách menu
function deleteMenu(id) {
    currentArticleId = id;
    deleteCurrentArticle();
}

// =====================================
// ADMIN DASHBOARD
// =====================================
function openAdminDashboard() {
    document.getElementById('adminDashboardModal').classList.remove('hidden');
    loadAdminClaims();
    loadAdminEdits();
}
function closeAdminDashboard() { document.getElementById('adminDashboardModal').classList.add('hidden'); }

async function loadAdminClaims() {
    const res = await fetch('/api/claims');
    const list = await res.json();
    let html = '';
    list.forEach(c => {
        html += `<div class="border-b pb-2 mb-2 flex justify-between items-center">
            <div><b>User:</b> ${c.users.username} muốn nhận là <b>${c.family_members.full_name}</b><br>
            <span class="text-xs text-gray-500">SĐT: ${c.request_phone} | Ghi chú: ${c.notes}</span></div>
            <button onclick="approveClaim(${c.id})" class="bg-green-500 text-white px-2 py-1 rounded text-sm">Duyệt</button>
        </div>`;
    });
    document.getElementById('adminClaimsList').innerHTML = html || 'Không có yêu cầu nào.';
}

async function approveClaim(id) {
    await fetch(`/api/claims/approve/${id}`, { method: 'POST' });
    loadAdminClaims();
    loadTree(); // Cập nhật lại cây để đánh dấu sở hữu
    updatePendingCount(); // Cập nhật lại số đếm trên nút
}

async function loadAdminEdits() {
    const res = await fetch('/api/edit_requests');
    const list = await res.json();
    let html = '';
    
    // Từ điển dịch key từ DB sang Tiếng Việt hiển thị
    const fieldLabels = {
        full_name: "Họ và tên",
        generation: "Đời thứ",
        child_order: "Con thứ",
        gender: "Giới tính",
        dob: "Ngày/Năm sinh",
        mother_name: "Tên Mẹ",
        spouse_name: "Vợ/Chồng",
        spouse_dob: "Năm sinh (Vợ/Chồng)",
        spouse_dod_solar: "Ngày mất Dương (Vợ/Chồng)",
        spouse_dod_lunar: "Ngày mất Âm (Vợ/Chồng)",
        spouse_father_name: "Tên Bố (Vợ/Chồng)",
        spouse_father_dob: "Năm sinh Bố (Vợ/Chồng)",
        spouse_father_dod_solar: "Ngày mất Dương Bố (Vợ/Chồng)",
        spouse_father_dod_lunar: "Ngày mất Âm Bố (Vợ/Chồng)",
        spouse_mother_name: "Tên Mẹ (Vợ/Chồng)",
        spouse_mother_dob: "Năm sinh Mẹ (Vợ/Chồng)",
        spouse_mother_dod_solar: "Ngày mất Dương Mẹ (Vợ/Chồng)",
        spouse_mother_dod_lunar: "Ngày mất Âm Mẹ (Vợ/Chồng)",
        phone: "Số điện thoại",
        address: "Địa chỉ",
        other_info: "Thông tin khác",
        is_alive: "Tình trạng",
        dod_solar: "Ngày mất (Dương)",
        dod_lunar: "Ngày mất (Âm)"
    };

    list.forEach(c => {
        const newData = c.proposed_data;
        const isEdit = !!newData.id; // Nếu có id thì là sửa, không có là thêm mới
        
        let detailsHtml = '';
        
        if (isEdit) {
            // Lấy thông tin cũ từ mảng familyData (đã load lúc vẽ cây)
            const oldData = familyData.find(d => d.id === newData.id) || {};
            
            detailsHtml += `<div class="mt-3 text-sm border border-gray-300 rounded bg-white overflow-hidden shadow-sm">
                <div class="grid grid-cols-3 bg-gray-100 font-bold p-2 border-b border-gray-300 text-center text-xs uppercase tracking-wider">
                    <div class="text-left">Trường dữ liệu</div>
                    <div class="text-red-600">Thông tin cũ</div>
                    <div class="text-green-600">Thông tin cập nhật</div>
                </div>`;
            
            let hasChanges = false;
            
            for (const key in fieldLabels) {
                let oldVal = oldData[key] !== null && oldData[key] !== undefined ? oldData[key] : '';
                let newVal = newData[key] !== null && newData[key] !== undefined ? newData[key] : '';
                
                // Xử lý riêng giao diện cho biến Boolean (Còn sống / Đã mất)
                if (key === 'is_alive') {
                    oldVal = oldVal ? "Còn sống" : "Đã mất";
                    newVal = newVal ? "Còn sống" : "Đã mất";
                }

                // Nếu có sự khác biệt mới in ra dòng so sánh
                if (String(oldVal).trim() !== String(newVal).trim()) {
                    hasChanges = true;
                    detailsHtml += `
                    <div class="grid grid-cols-3 p-2 border-b border-dashed border-gray-200 last:border-0 text-sm">
                        <div class="font-medium text-gray-700">${fieldLabels[key]}</div>
                        <div class="text-gray-500 line-through break-words pr-2">${oldVal || '<i class="text-gray-300 font-normal">Trống</i>'}</div>
                        <div class="text-green-700 font-bold break-words pr-2 bg-green-50 rounded pl-1">${newVal || '<i class="text-gray-300 font-normal">Trống</i>'}</div>
                    </div>`;
                }
            }
            
            if (!hasChanges) {
                detailsHtml += `<div class="p-3 text-gray-500 italic text-center">Không phát hiện sự thay đổi nội dung nào so với hiện tại.</div>`;
            }
            detailsHtml += `</div>`;
            
        } else {
            // Hiển thị giao diện cho Đề nghị THÊM NGƯỜI MỚI
            detailsHtml += `<div class="mt-3 text-sm border border-green-300 rounded bg-green-50 overflow-hidden shadow-sm">
                <div class="bg-green-100 text-green-800 font-bold p-2 border-b border-green-300 text-xs uppercase text-center">Thêm người mới</div>
                <div class="grid grid-cols-2 gap-2 p-3">`;
            for (const key in fieldLabels) {
                if (newData[key] && newData[key] !== '') {
                    let val = newData[key];
                    if (key === 'is_alive') val = val ? "Còn sống" : "Đã mất";
                    detailsHtml += `<div class="font-medium text-gray-700">${fieldLabels[key]}:</div><div class="text-gray-900 font-bold">${val}</div>`;
                }
            }
            detailsHtml += `</div></div>`;
        }

        // Tùy biến text hiển thị tùy theo loại hành động
        const actionText = isEdit 
            ? `đề nghị <b>sửa thông tin</b> của nút <b>${c.family_members?.full_name || 'này'}</b>` 
            : `đề nghị <b>THÊM MỚI</b> một người con cho nhánh <b>${c.family_members?.full_name || 'này'}</b>`;

        html += `<div class="border border-blue-200 rounded-lg p-4 mb-4 bg-gray-50 shadow-sm">
            <div class="flex justify-between items-start mb-2 border-b border-gray-200 pb-3">
                <div class="text-gray-800 text-base"><b>User:</b> <span class="text-blue-700 font-bold">${c.users.username}</span> ${actionText}</div>
                <button onclick="approveEdit(${c.id})" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded font-bold text-sm shadow transition">Duyệt & Áp dụng</button>
            </div>
            ${detailsHtml}
        </div>`;
    });
    
    document.getElementById('adminEditsList').innerHTML = html || '<div class="text-gray-500 italic p-3 text-center border rounded bg-white">Không có đề nghị thay đổi nào đang chờ duyệt.</div>';
}

async function approveEdit(id) {
    await fetch(`/api/edit_requests/approve/${id}`, { method: 'POST' });
    loadAdminEdits();
    loadTree();
    updatePendingCount(); // Cập nhật lại số đếm trên nút
}

// Hàm mới: Lấy và đếm tổng số yêu cầu chờ duyệt
async function updatePendingCount() {
    try {
        // Gọi song song 2 API để lấy danh sách yêu cầu đang chờ duyệt
        const [claimsRes, editsRes] = await Promise.all([
            fetch('/api/claims'),
            fetch('/api/edit_requests')
        ]);

        if (claimsRes.ok && editsRes.ok) {
            const claims = await claimsRes.json();
            const edits = await editsRes.json();
            
            // Tính tổng số yêu cầu
            const totalPending = claims.length + edits.length;
            
            // Cập nhật lại Text của nút bấm
            const btn = document.getElementById('adminApproveBtn');
            if (btn) {
                if (totalPending > 0) {
                    btn.innerHTML = `Duyệt Yêu cầu (${totalPending})`;
                    // Bổ sung thêm class animate-pulse của Tailwind để nút nhấp nháy nhẹ gây chú ý
                    btn.classList.add('animate-pulse'); 
                } else {
                    btn.innerHTML = `Duyệt Yêu cầu`;
                    btn.classList.remove('animate-pulse');
                }
            }
        }
    } catch (e) {
        console.error("Lỗi khi đếm số yêu cầu:", e);
    }
}

// =====================================
// LOGIC TÍNH TOÁN NGÀY GIỖ (30 NGÀY TỚI)
// =====================================
function renderAnniversaries() {
    const sameBranchContainer = document.getElementById('anniv-same-branch');
    const otherBranchContainer = document.getElementById('anniv-other-branch');
    
    if (!sameBranchContainer || !otherBranchContainer || typeof Lunar === 'undefined') return;
    
    // 1. Tạo bảng tra cứu 30 ngày tới (Tính cả Dương và Âm)
    const upcomingDates = { solar: {}, lunar: {} };
    const today = new Date();
    
    for (let i = 0; i <= 30; i++) {
        let d = new Date(today);
        d.setDate(today.getDate() + i);
        
        let solarStr = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        
        // Đổi sang ngày Âm bằng thư viện lunar-javascript
        let lunarDate = Lunar.fromDate(d);
        let lunarStr = String(lunarDate.getDay()).padStart(2, '0') + '/' + String(lunarDate.getMonth()).padStart(2, '0');
        
        upcomingDates.solar[solarStr] = { daysLeft: i, exactDate: d };
        upcomingDates.lunar[lunarStr] = { daysLeft: i, exactDate: d };
    }

    // Hàm lấy chuỗi DD/MM từ ngày người dùng nhập
    function getDM(dateStr) {
        if (!dateStr) return null;
        let match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})/);
        return match ? String(match[1]).padStart(2, '0') + '/' + String(match[2]).padStart(2, '0') : null;
    }

    let events = [];

    // 2. Quét toàn bộ gia phả
    familyData.forEach(member => {
        const isSameBranch = checkEditPermission(member.id);
        
        // Tính toán danh xưng cho Bản thân
        const nodePrefix = getTitlePrefix(member.generation, member.gender);
        const nodeName = `${nodePrefix} ${member.full_name}`;
        const nodeDesc = `${nodeName} đời thứ ${member.generation}`;

        // Hàm kiểm tra và đẩy vào danh sách
        const checkAndAdd = (dateStr, personName, relationDesc, isLunar) => {
            const dm = getDM(dateStr);
            if (!dm) return;
            
            const lookup = isLunar ? upcomingDates.lunar : upcomingDates.solar;
            if (lookup[dm]) {
                const typeStr = isLunar ? `(Âm lịch: ${dm})` : `(Dương lịch: ${dm})`;
                
                events.push({
                    nodeId: member.id,
                    title: `Ngày giỗ của ${personName} ${relationDesc}`,
                    daysLeft: lookup[dm].daysLeft,
                    isSameBranch: isSameBranch,
                    typeStr: typeStr // Đã bao gồm cả ngày mất
                });
            }
        };

        // A. Check bản thân
        checkAndAdd(member.dod_solar, nodeName, `đời thứ ${member.generation}`, false);
        checkAndAdd(member.dod_lunar, nodeName, `đời thứ ${member.generation}`, true);
        
        // B. Check Vợ/Chồng (Cùng đời với bản thân)
        if (member.spouse_name) {
            const spouseGender = member.gender === 'Nam' ? 'Nữ' : 'Nam';
            const spousePrefix = getTitlePrefix(member.generation, spouseGender);
            const spouseFullName = `${spousePrefix} ${member.spouse_name}`;
            const relation = `(${member.gender === 'Nam' ? 'Vợ' : 'Chồng'} của ${nodeDesc})`;
            
            checkAndAdd(member.spouse_dod_solar, spouseFullName, relation, false);
            checkAndAdd(member.spouse_dod_lunar, spouseFullName, relation, true);
        }
        
        // Tính toán bậc Đời cho Phụ mẫu (Bố/Mẹ vợ hoặc Bố/Mẹ chồng)
        // Dùng Math.max(1, ...) để tránh bị âm hoặc bằng 0 nếu nút hiện tại là Đời 1
        const parentGen = Math.max(1, member.generation - 1);
        
        // C. Check Bố (Vợ/Chồng)
        if (member.spouse_father_name) {
            const fatherPrefix = getTitlePrefix(parentGen, 'Nam');
            const fatherFullName = `${fatherPrefix} ${member.spouse_father_name}`;
            const relation = `(Bố ${member.gender === 'Nam' ? 'vợ' : 'chồng'} của ${nodeDesc})`;
            
            checkAndAdd(member.spouse_father_dod_solar, fatherFullName, relation, false);
            checkAndAdd(member.spouse_father_dod_lunar, fatherFullName, relation, true);
        }
        
        // D. Check Mẹ (Vợ/Chồng)
        if (member.spouse_mother_name) {
            const motherPrefix = getTitlePrefix(parentGen, 'Nữ');
            const motherFullName = `${motherPrefix} ${member.spouse_mother_name}`;
            const relation = `(Mẹ ${member.gender === 'Nam' ? 'vợ' : 'chồng'} của ${nodeDesc})`;
            
            checkAndAdd(member.spouse_mother_dod_solar, motherFullName, relation, false);
            checkAndAdd(member.spouse_mother_dod_lunar, motherFullName, relation, true);
        }
    });

    // 3. Sắp xếp đếm lùi và Render HTML
    events.sort((a, b) => a.daysLeft - b.daysLeft);

    let htmlSame = '';
    let htmlOther = '';

    events.forEach(e => {
        let dayText = e.daysLeft === 0 ? '<span class="text-red-600 font-bold animate-pulse">Hôm nay</span>' : `còn ${e.daysLeft} ngày`;
        let html = `
            <div class="p-3 bg-white rounded shadow-sm border border-gray-200 hover:border-blue-400 hover:shadow-md transition flex items-center justify-between">
                <div>
                    <a href="javascript:void(0)" onclick="viewNodeFromAnniv('${e.nodeId}')" class="text-blue-700 font-bold hover:underline text-[15px]">${e.title}</a>
                    <span class="text-xm text-green-500 ml-2 font-medium">${e.typeStr}</span>
                </div>
                <div class="text-sm font-bold ${e.daysLeft <= 3 ? 'text-red-600' : 'text-orange-500'} bg-gray-50 px-3 py-1 rounded-full border">
                    ${dayText}
                </div>
            </div>`;
        if (e.isSameBranch) htmlSame += html;
        else htmlOther += html;
    });

    sameBranchContainer.innerHTML = htmlSame || '<p class="text-gray-500 italic text-sm">Không có ngày giỗ nào sắp tới trong nhánh của bạn.</p>';
    otherBranchContainer.innerHTML = htmlOther || '<p class="text-gray-500 italic text-sm">Không có ngày giỗ nào sắp tới.</p>';
}

// Xử lý khi nhấn vào Tên ở Tab Ngày Giỗ
function viewNodeFromAnniv(nodeId) {
    switchTab('tree');
    applySearchHighlight(nodeId);
    
    // Đợi hiệu ứng chuyển Tab và Zoom cây hoàn tất rồi mới mở bảng chi tiết
    setTimeout(() => { 
        openInfoModal(nodeId); 
    }, 400);
}

loadTree();