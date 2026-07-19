/* ===================================================================
   CDC Hải Phòng — Quản lý Nhiệm vụ & Báo cáo (bản di động / PWA)
   Gọi API JSON của BCtuan (Code.gs -> xuLyYeuCauApiDiDong_) qua fetch.
   Cấu trúc dữ liệu nhiệm vụ/danh mục GIỐNG HỆT bản desktop (dạng lồng
   nhau từ TaskService.layDuLieuKhoiTao) — xem src/frontend/js.html.
   =================================================================== */

'use strict';

const API_BASE_URL = (window.CDC_MOBILE_CONFIG && window.CDC_MOBILE_CONFIG.API_BASE_URL) || '';
const IDENTITY_KEY = 'cdcTaskIdentity';
const NGUONG_SAP_DEN_HAN_NGAY = 3; // khớp dashboard.js.html bản desktop

/** Các khoa/phòng có quyền xem TOÀN BỘ nhiệm vụ — khớp DON_VI_QUYEN_TOAN_BO ở Common.gs. */
const DON_VI_QUYEN_TOAN_BO = ['Phòng Kế hoạch - Nghiệp vụ', 'Ban Giám đốc'];

let CDC_NHIEM_VU = [];
let CDC_DANH_MUC = { donVi: [], nguonGiao: [], loaiVanBanGiao: [], loaiVanBanKetQua: [], mucUuTien: [], quanTri: [] };

/* Bộ lọc trang Nhiệm vụ */
let locTrangThai = '';
let locTuKhoa = '';
let xemTatCa = false; // chỉ có tác dụng khi coQuyenXemToanBo()

/* ============================= GỌI API ============================= */

/**
 * Gọi API JSON của BCtuan. GET cho action chỉ đọc, POST (text/plain để né
 * CORS preflight — GAS không có doOptions) cho action ghi dữ liệu.
 * @param {string} action
 * @param {Object} [payload]
 * @param {boolean} [dungPost]
 * @return {Promise<*>} data trong envelope {ok, data|error}.
 */
async function goiApi(action, payload, dungPost) {
  if (!API_BASE_URL) {
    throw new Error('Chưa cấu hình API_BASE_URL trong config.js (xem README.md).');
  }
  let resp;
  if (dungPost) {
    resp = await fetch(API_BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload: payload || {} })
    });
  } else {
    const qs = new URLSearchParams(Object.assign({ action }, payload || {}));
    resp = await fetch(API_BASE_URL + '?' + qs.toString());
  }
  if (!resp.ok) throw new Error('Lỗi mạng/máy chủ (HTTP ' + resp.status + ').');
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Lỗi không xác định từ máy chủ.');
  return json.data;
}

/** Đọc danh sách File thành mảng {tenTep, base64Data, mimeType} — cùng định dạng js.html desktop gửi cho DriveService. */
function docDanhSachTepThanhBase64(danhSachFile) {
  const mang = Array.from(danhSachFile || []);
  return Promise.all(mang.map((tep) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      tenTep: tep.name,
      base64Data: String(reader.result).split(',')[1],
      mimeType: tep.type || 'application/octet-stream'
    });
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(tep);
  })));
}

/* ============================= TIỆN ÍCH ============================= */

function $(id) { return document.getElementById(id); }

function thoatHtml(chuoi) {
  if (chuoi === null || chuoi === undefined) return '';
  return String(chuoi)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function dinhDangNgay(gtNgay) {
  if (!gtNgay) return '';
  const d = (gtNgay instanceof Date) ? gtNgay : new Date(gtNgay);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function dinhDangNgayGio(gtNgay) {
  if (!gtNgay) return '';
  const d = (gtNgay instanceof Date) ? gtNgay : new Date(gtNgay);
  if (isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${dinhDangNgay(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function soNgayConLai(ngayHan) {
  const homNay = new Date(); homNay.setHours(0, 0, 0, 0);
  const han = new Date(ngayHan); han.setHours(0, 0, 0, 0);
  return Math.round((han - homNay) / (1000 * 60 * 60 * 24));
}

function laSoDienThoaiHopLe(sdt) {
  return /^0\d{9}$/.test(String(sdt || '').trim());
}

function lopCssTrangThai(trangThai) {
  const map = {
    'Mới giao': 'cdc-m-pill--new', 'Đang thực hiện': 'cdc-m-pill--doing', 'Hoàn thành': 'cdc-m-pill--done',
    'Quá hạn': 'cdc-m-pill--overdue', 'Chậm tiến độ': 'cdc-m-pill--late'
  };
  return map[trangThai] || 'cdc-m-pill--new';
}

function lopCssUuTien(mucUuTien) {
  const map = { 'Khẩn': 'cdc-m-priority--urgent', 'Cao': 'cdc-m-priority--high', 'Trung bình': 'cdc-m-priority--medium', 'Thấp': 'cdc-m-priority--low' };
  return map[mucUuTien] || '';
}

/* ============================= TOAST / LOADING / OFFLINE ============================= */

function toast(noiDung, loai) {
  const el = document.createElement('div');
  el.className = 'cdc-m-toast' + (loai ? ' cdc-m-toast--' + loai : '');
  el.textContent = noiDung;
  $('cdcMToast').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, loai === 'error' ? 4500 : 2800);
}
const thongBaoThanhCong = (m) => toast(m, 'success');
const thongBaoLoi = (m) => toast((m && m.message) ? m.message : String(m), 'error');

function hienThiDangTai() { $('cdcMLoading').classList.add('show'); }
function anDangTai() { $('cdcMLoading').classList.remove('show'); }

function capNhatBannerOffline() {
  $('offlineBanner').classList.toggle('show', !navigator.onLine);
}

/* ============================= ĐỊNH DANH ============================= */

function layDinhDanhHienTai() {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function luuDinhDanh(dt) { localStorage.setItem(IDENTITY_KEY, JSON.stringify(dt)); }
function xoaDinhDanh() { localStorage.removeItem(IDENTITY_KEY); }

function capNhatBadgeNguoiDung() {
  const dt = layDinhDanhHienTai();
  $('headerUserName').textContent = dt ? dt.hoTen : 'Khách';
  $('headerUserDept').textContent = dt ? dt.khoaPhong : '—';
}

/** Cùng quy tắc coQuyenXemToanBo() của js.html desktop. */
function coQuyenXemToanBo() {
  const dt = layDinhDanhHienTai();
  if (!dt) return false;
  if (DON_VI_QUYEN_TOAN_BO.indexOf(dt.khoaPhong) !== -1) return true;
  const dsQuanTri = (CDC_DANH_MUC.quanTri || []).map((t) => t.trim().toLowerCase());
  return dsQuanTri.indexOf(String(dt.hoTen || '').trim().toLowerCase()) !== -1;
}

/** Cùng quy tắc coQuyenSuaNhiemVu() của js.html desktop. */
function coQuyenSuaNhiemVu(nv) {
  const dt = layDinhDanhHienTai();
  if (!dt) return false;
  if (coQuyenXemToanBo()) return true;
  return nv.donViThucHien === dt.khoaPhong;
}

function moSheetDinhDanh() {
  const sel = $('idKhoaPhong');
  sel.innerHTML = '<option value="">Chọn khoa/phòng...</option>' +
    CDC_DANH_MUC.donVi.map((dv) => `<option value="${thoatHtml(dv)}">${thoatHtml(dv)}</option>`).join('');
  $('formDinhDanh').reset();
  $('sheetDinhDanh').classList.add('show');
}

function xuLySubmitDinhDanh(evt) {
  evt.preventDefault();
  const khoaPhong = $('idKhoaPhong').value;
  const hoTen = $('idHoTen').value.trim();
  const soDienThoai = $('idSoDienThoai').value.trim();

  if (!khoaPhong) { thongBaoLoi('Vui lòng chọn khoa/phòng.'); return; }
  if (!hoTen) { thongBaoLoi('Vui lòng nhập họ và tên.'); return; }
  if (!laSoDienThoaiHopLe(soDienThoai)) { thongBaoLoi('Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).'); return; }

  luuDinhDanh({ khoaPhong, hoTen, soDienThoai });
  capNhatBadgeNguoiDung();
  $('sheetDinhDanh').classList.remove('show');
  thongBaoThanhCong('Đã lưu thông tin người dùng trên điện thoại này.');
  capNhatNutScope();
  renderTrangHienTai();
}

/* ============================= ĐIỀU HƯỚNG TAB ============================= */

let trangHienTai = 'dashboard';

function chuyenTrang(tenTrang) {
  trangHienTai = tenTrang;
  document.querySelectorAll('.cdc-m-view').forEach((el) => el.classList.remove('active'));
  $('view-' + tenTrang).classList.add('active');
  document.querySelectorAll('.cdc-m-tab').forEach((el) => el.classList.toggle('active', el.dataset.page === tenTrang));
  window.scrollTo({ top: 0 });
  renderTrangHienTai();
}

function renderTrangHienTai() {
  if (trangHienTai === 'dashboard') renderDashboard();
  else if (trangHienTai === 'tasks') renderDsNhiemVu();
  /* reports: render khi bấm "Xem báo cáo" */
}

/* ============================= PHẠM VI DỮ LIỆU THEO ĐỊNH DANH ============================= */

/** Danh sách nhiệm vụ trong phạm vi hiện tại: toàn bộ (nếu có quyền + bật "Tất cả") hoặc chỉ đơn vị mình. */
function dsNhiemVuTheoPhamVi() {
  const dt = layDinhDanhHienTai();
  if (!dt) return CDC_NHIEM_VU;
  if (coQuyenXemToanBo() && xemTatCa) return CDC_NHIEM_VU;
  if (coQuyenXemToanBo() && !xemTatCa) return CDC_NHIEM_VU; // đơn vị quyền toàn bộ mặc định thấy tất cả (giống desktop)
  return CDC_NHIEM_VU.filter((nv) => nv.donViThucHien === dt.khoaPhong);
}

function capNhatNutScope() {
  const btn = $('btnScopeToggle');
  /* Người thường: luôn bị khoá theo đơn vị mình -> ẩn nút. Người có quyền toàn bộ: đã thấy tất cả -> cũng ẩn.
     Nút này để dành khi muốn thêm chế độ lọc "chỉ đơn vị tôi" cho người toàn quyền — hiện ẩn cho gọn. */
  btn.style.display = 'none';
}

/* ============================= DASHBOARD ============================= */

function tinhThongKeDashboard(danhSach) {
  const tk = { tongSo: danhSach.length, hoanThanh: 0, dangThucHien: 0, chamTienDo: 0, moiGiao: 0, quaHan: 0, sapDenHan: 0 };
  danhSach.forEach((nv) => {
    const tt = nv.trangThai;
    if (tt === 'Hoàn thành') tk.hoanThanh++;
    else if (tt === 'Đang thực hiện') tk.dangThucHien++;
    else if (tt === 'Chậm tiến độ') tk.chamTienDo++;
    else if (tt === 'Mới giao') tk.moiGiao++;
    else if (tt === 'Quá hạn') tk.quaHan++;
    if (tt !== 'Hoàn thành') {
      const conLai = soNgayConLai(nv.hanHoanThanh);
      if (conLai >= 0 && conLai <= NGUONG_SAP_DEN_HAN_NGAY) tk.sapDenHan++;
    }
  });
  return tk;
}

function renderDashboard() {
  const ds = dsNhiemVuTheoPhamVi();
  const tk = tinhThongKeDashboard(ds);
  $('statTongSo').textContent = tk.tongSo;
  $('statHoanThanh').textContent = tk.hoanThanh;
  $('statDangThucHien').textContent = tk.dangThucHien;
  $('statChamTienDo').textContent = tk.chamTienDo;
  $('statSapDenHan').textContent = tk.sapDenHan;
  $('statQuaHan').textContent = tk.quaHan;

  const dsSapDenHan = ds
    .filter((nv) => nv.trangThai !== 'Hoàn thành')
    .map((nv) => ({ nv, conLai: soNgayConLai(nv.hanHoanThanh) }))
    .filter((x) => x.conLai >= 0 && x.conLai <= NGUONG_SAP_DEN_HAN_NGAY)
    .sort((a, b) => a.conLai - b.conLai);

  const khung = $('dsSapDenHan');
  if (!dsSapDenHan.length) {
    khung.innerHTML = '<div class="cdc-m-empty">Không có nhiệm vụ nào sắp đến hạn.</div>';
    return;
  }
  khung.innerHTML = dsSapDenHan.map(({ nv, conLai }) => `
    <button class="cdc-m-task-item" data-task-id="${thoatHtml(nv.id)}">
      <div class="cdc-m-task-item__top">
        <span><span class="cdc-m-code">${thoatHtml(nv.id)}</span></span>
        <span class="cdc-m-pill ${conLai === 0 ? 'cdc-m-pill--late' : 'cdc-m-pill--soon'}">${conLai === 0 ? 'Hạn hôm nay' : 'Còn ' + conLai + ' ngày'}</span>
      </div>
      <div class="cdc-m-task-item__title">${thoatHtml(nv.trichYeu)}</div>
      <div class="cdc-m-task-item__meta">
        <span>🏢 ${thoatHtml(nv.donViThucHien)}</span>
        <span>📅 Hạn: ${dinhDangNgay(nv.hanHoanThanh)}</span>
      </div>
    </button>`).join('');
  khung.querySelectorAll('[data-task-id]').forEach((el) => {
    el.addEventListener('click', () => moChiTietNhiemVu(el.dataset.taskId));
  });
}

/* ============================= DANH SÁCH NHIỆM VỤ ============================= */

function renderDsNhiemVu() {
  let ds = dsNhiemVuTheoPhamVi();
  if (locTrangThai) ds = ds.filter((nv) => nv.trangThai === locTrangThai);
  if (locTuKhoa) {
    const tu = locTuKhoa.toLowerCase();
    ds = ds.filter((nv) =>
      String(nv.id).toLowerCase().includes(tu) ||
      String(nv.trichYeu || '').toLowerCase().includes(tu) ||
      String(nv.nguoiPhuTrach || '').toLowerCase().includes(tu) ||
      String(nv.donViThucHien || '').toLowerCase().includes(tu));
  }
  ds = ds.slice().sort((a, b) => new Date(a.hanHoanThanh) - new Date(b.hanHoanThanh));

  const khung = $('dsNhiemVu');
  if (!ds.length) {
    khung.innerHTML = '<div class="cdc-m-empty">Không có nhiệm vụ nào phù hợp.</div>';
    return;
  }
  khung.innerHTML = ds.map((nv) => `
    <button class="cdc-m-task-item" data-task-id="${thoatHtml(nv.id)}">
      <div class="cdc-m-task-item__top">
        <span><span class="cdc-m-code">${thoatHtml(nv.id)}</span><span class="${lopCssUuTien(nv.mucUuTien)}" style="font-size:.7rem">${thoatHtml(nv.mucUuTien)}</span></span>
        <span class="cdc-m-pill ${lopCssTrangThai(nv.trangThai)}">${thoatHtml(nv.trangThai)}</span>
      </div>
      <div class="cdc-m-task-item__title">${thoatHtml(nv.trichYeu)}</div>
      <div class="cdc-m-task-item__meta">
        <span>🏢 ${thoatHtml(nv.donViThucHien)}</span>
        <span>👤 ${thoatHtml(nv.nguoiPhuTrach || '—')}</span>
        <span>📅 Hạn: ${dinhDangNgay(nv.hanHoanThanh)}</span>
      </div>
    </button>`).join('');
  khung.querySelectorAll('[data-task-id]').forEach((el) => {
    el.addEventListener('click', () => moChiTietNhiemVu(el.dataset.taskId));
  });
}

/* ============================= CHI TIẾT NHIỆM VỤ ============================= */

function moChiTietNhiemVu(maNhiemVu) {
  const nv = CDC_NHIEM_VU.find((x) => x.id === maNhiemVu);
  if (!nv) { thongBaoLoi('Không tìm thấy nhiệm vụ ' + maNhiemVu); return; }

  $('ctTieuDe').textContent = nv.id;

  const lichSu = (nv.lichSuCapNhat || []).slice().reverse(); // mới nhất lên đầu
  const htmlLichSu = lichSu.length
    ? '<div class="cdc-m-timeline">' + lichSu.map((cn) => {
        let tepHtml = '';
        try {
          const dsTep = JSON.parse(cn.tepDinhKemJson || '[]');
          if (dsTep.length) {
            tepHtml = '<div style="margin-top:.25rem">' + dsTep.map((t) =>
              `<a href="${thoatHtml(t.url)}" target="_blank" rel="noopener" style="font-size:.74rem">📎 ${thoatHtml(t.ten)}</a>`).join('<br>') + '</div>';
          }
        } catch (e) { /* tepDinhKemJson hỏng — bỏ qua */ }
        return `
        <div class="cdc-m-timeline-item">
          <div class="cdc-m-timeline-item__meta">${dinhDangNgayGio(cn.ngayCapNhat)} · ${thoatHtml(cn.nguoiCapNhat)} · ${thoatHtml(cn.tuanBaoCao)}${cn.daHoanThanh ? ' · <b style="color:var(--cdc-green)">Đã hoàn thành</b>' : ''}${cn.canChiDao ? ' · <b style="color:var(--cdc-red)">Cần chỉ đạo</b>' : ''}</div>
          ${cn.ketQua ? `<div><b>Kết quả:</b> ${thoatHtml(cn.ketQua)}</div>` : ''}
          ${cn.tienDoHienTai ? `<div><b>Tiến độ:</b> ${thoatHtml(cn.tienDoHienTai)}</div>` : ''}
          ${cn.duKienHoanThanh ? `<div><b>Dự kiến hoàn thành:</b> ${dinhDangNgay(cn.duKienHoanThanh)}</div>` : ''}
          ${cn.khoKhan ? `<div><b>Khó khăn:</b> ${thoatHtml(cn.khoKhan)}</div>` : ''}
          ${tepHtml}
        </div>`;
      }).join('') + '</div>'
    : '<div class="cdc-m-empty">Chưa có lượt cập nhật nào.</div>';

  const vb = nv.vanBanKetQua;
  const htmlVanBan = vb ? `
    <div class="cdc-m-card">
      <div class="cdc-m-card__title">📄 Văn bản kết quả</div>
      <div class="cdc-m-info-grid">
        <div><div class="k">Loại văn bản</div>${thoatHtml(vb.loaiVanBan)}</div>
        <div><div class="k">Số ký hiệu</div>${thoatHtml(vb.soKyHieu)}</div>
        <div><div class="k">Ngày ban hành</div>${dinhDangNgay(vb.ngayBanHanh)}</div>
        <div><div class="k">Trích yếu</div>${thoatHtml(vb.trichYeu)}</div>
        ${vb.duongDanTep ? `<div><a href="${thoatHtml(vb.duongDanTep)}" target="_blank" rel="noopener">📎 Mở tệp văn bản</a></div>` : ''}
      </div>
    </div>` : '';

  $('ctNoiDung').innerHTML = `
    <div class="cdc-m-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;margin-bottom:.5rem">
        <span class="cdc-m-pill ${lopCssTrangThai(nv.trangThai)}">${thoatHtml(nv.trangThai)}</span>
        <span class="${lopCssUuTien(nv.mucUuTien)}" style="font-size:.78rem">${thoatHtml(nv.mucUuTien)}</span>
      </div>
      <div class="cdc-m-task-item__title" style="font-size:.95rem">${thoatHtml(nv.trichYeu)}</div>
      <div class="cdc-m-info-grid" style="margin-top:.7rem">
        <div><div class="k">Nguồn giao</div>${thoatHtml(nv.nguonGiao)}</div>
        ${nv.loaiVanBanGiao ? `<div><div class="k">Văn bản giao</div>${thoatHtml(nv.loaiVanBanGiao)} ${thoatHtml(nv.soKyHieuVanBan || '')} ${nv.ngayBanHanhVanBan ? '· ' + dinhDangNgay(nv.ngayBanHanhVanBan) : ''}</div>` : ''}
        <div><div class="k">Ngày giao</div>${dinhDangNgay(nv.ngayGiao)}</div>
        <div><div class="k">Hạn hoàn thành</div>${dinhDangNgay(nv.hanHoanThanh)}</div>
        <div><div class="k">Đơn vị thực hiện</div>${thoatHtml(nv.donViThucHien)}</div>
        <div><div class="k">Người phụ trách</div>${thoatHtml(nv.nguoiPhuTrach || '—')}</div>
        ${nv.laViecPhatSinh ? '<div><div class="k">Phân loại</div>Việc phát sinh (ngoài kế hoạch)</div>' : ''}
      </div>
      ${coQuyenSuaNhiemVu(nv) ? `<button class="cdc-m-btn cdc-m-btn--primary" id="btnMoCapNhat">✏️ Cập nhật tiến độ</button>` : ''}
    </div>
    ${htmlVanBan}
    <div class="cdc-m-card">
      <div class="cdc-m-card__title">🕘 Lịch sử cập nhật tiến độ</div>
      ${htmlLichSu}
    </div>`;

  const btnCapNhat = $('btnMoCapNhat');
  if (btnCapNhat) btnCapNhat.addEventListener('click', () => moFormCapNhat(nv));

  $('sheetChiTiet').classList.add('show');
}

/* ============================= CẬP NHẬT TIẾN ĐỘ ============================= */

function moFormCapNhat(nv) {
  const dt = layDinhDanhHienTai();
  if (!dt) { moSheetDinhDanh(); return; }

  $('formCapNhat').reset();
  $('cnMaNhiemVu').value = nv.id;
  $('cnTrichYeuNhiemVu').innerHTML = `<span class="cdc-m-code">${thoatHtml(nv.id)}</span> ${thoatHtml(nv.trichYeu)}`;
  $('cnNguoiCapNhat').value = dt.hoTen + ' (' + dt.khoaPhong + ')';

  $('cnLoaiVanBanKetQua').innerHTML = '<option value="">Chọn loại văn bản...</option>' +
    (CDC_DANH_MUC.loaiVanBanKetQua || []).map((l) => `<option value="${thoatHtml(l)}">${thoatHtml(l)}</option>`).join('');

  $('cnKhoiNgayHoanThanh').style.display = 'none';
  $('cnKhoiVanBanKetQua').style.display = 'none';

  $('sheetCapNhat').classList.add('show');
}

function xuLyDoiDaHoanThanh() {
  const daXong = $('cnDaHoanThanh').checked;
  $('cnKhoiNgayHoanThanh').style.display = daXong ? '' : 'none';
  $('cnKhoiVanBanKetQua').style.display = daXong ? '' : 'none';
}

async function xuLySubmitCapNhat(evt) {
  evt.preventDefault();
  const dt = layDinhDanhHienTai();
  if (!dt) { moSheetDinhDanh(); return; }

  const daHoanThanh = $('cnDaHoanThanh').checked;
  const ketQua = $('cnKetQua').value.trim();
  const tienDoHienTai = $('cnTienDoHienTai').value.trim();

  if (!daHoanThanh) {
    if (!ketQua) { thongBaoLoi('Vui lòng nhập kết quả thực hiện trong tuần.'); return; }
    if (!tienDoHienTai) { thongBaoLoi('Vui lòng nhập tiến độ hiện tại.'); return; }
  }

  hienThiDangTai();
  try {
    const tepDinhKem = await docDanhSachTepThanhBase64($('cnTepDinhKem').files);

    const input = {
      maNhiemVu: $('cnMaNhiemVu').value,
      nguoiCapNhat: dt.hoTen + ' (' + dt.khoaPhong + ')',
      khoaPhongNguoiCapNhat: dt.khoaPhong,
      hoTenNguoiCapNhat: dt.hoTen,
      ketQua, tienDoHienTai,
      duKienHoanThanh: $('cnDuKienHoanThanh').value || '',
      khoKhan: $('cnKhoKhan').value.trim(),
      daHoanThanh,
      ngayHoanThanh: daHoanThanh ? ($('cnNgayHoanThanh').value || '') : '',
      canChiDao: $('cnCanChiDao').checked,
      tepDinhKem
    };

    if (daHoanThanh && $('cnSoKyHieuKetQua').value.trim()) {
      const dsTepVb = await docDanhSachTepThanhBase64($('cnTepVanBanKetQua').files);
      input.vanBanKetQua = {
        loaiVanBan: $('cnLoaiVanBanKetQua').value,
        soKyHieu: $('cnSoKyHieuKetQua').value.trim(),
        ngayBanHanh: $('cnNgayBanHanhKetQua').value || '',
        trichYeu: $('cnTrichYeuKetQua').value.trim(),
        tepDinhKem: dsTepVb.length ? dsTepVb[0] : null
      };
    }

    const nvMoi = await goiApi('capNhatTienDoNhiemVu', input, true);

    // Thay bản ghi trong cache cục bộ rồi vẽ lại.
    const idx = CDC_NHIEM_VU.findIndex((x) => x.id === nvMoi.id);
    if (idx !== -1) CDC_NHIEM_VU[idx] = nvMoi; else CDC_NHIEM_VU.push(nvMoi);

    $('sheetCapNhat').classList.remove('show');
    $('sheetChiTiet').classList.remove('show');
    thongBaoThanhCong('Đã lưu cập nhật tiến độ.');
    renderTrangHienTai();
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= BÁO CÁO ============================= */

function xuLyDoiLoaiKy() {
  const loaiKy = $('rpLoaiKy').value;
  $('rpThamSoTuanWrap').style.display = loaiKy === 'TUAN' ? '' : 'none';
  $('rpThamSoThangWrap').style.display = loaiKy === 'THANG' ? '' : 'none';
  $('rpThamSoQuyWrap').style.display = loaiKy === 'QUY' ? '' : 'none';
  $('rpThamSoQuyNamWrap').style.display = loaiKy === 'QUY' ? '' : 'none';
  $('rpThamSoNamWrap').style.display = loaiKy === 'NAM' ? '' : 'none';
}

/** Dựng tham số kỳ đúng dạng getPeriodRange_ (Utils.gs) yêu cầu cho từng loại kỳ. */
function layThamSoKy() {
  const loaiKy = $('rpLoaiKy').value;
  if (loaiKy === 'TUAN') {
    const d = $('rpThamSoTuan').value;
    if (!d) throw new Error('Vui lòng chọn 1 ngày trong tuần cần xem.');
    return d; // chuỗi yyyy-mm-dd — getPeriodRange_ tự new Date()
  }
  if (loaiKy === 'THANG') {
    const t = $('rpThamSoThang').value; // yyyy-mm
    if (!t) throw new Error('Vui lòng chọn tháng.');
    return t;
  }
  if (loaiKy === 'QUY') {
    const quy = Number($('rpThamSoQuy').value);
    const nam = Number($('rpThamSoQuyNam').value);
    if (!nam) throw new Error('Vui lòng nhập năm.');
    return { quy, nam };
  }
  const nam = Number($('rpThamSoNam').value);
  if (!nam) throw new Error('Vui lòng nhập năm.');
  return nam;
}

function renderMucBaoCao(tieuDe, ds, kieu) {
  if (!ds || !ds.length) return '';
  const dong = ds.map((m) => `
    <div style="border-left:3px solid ${kieu === 'done' ? 'var(--cdc-green)' : kieu === 'late' ? 'var(--cdc-red)' : 'var(--cdc-blue-100)'};padding:.3rem .6rem;margin-bottom:.45rem;font-size:.82rem">
      <div><span class="cdc-m-code">${thoatHtml(m.id)}</span><b>${thoatHtml(m.trichYeu)}</b></div>
      <div style="font-size:.72rem;color:var(--cdc-gray-500)">${thoatHtml(m.donViThucHien)}${m.hanHoanThanh ? ' · Hạn: ' + dinhDangNgay(m.hanHoanThanh) : ''}</div>
      ${m.cauVanBanKetQua ? `<div style="font-size:.76rem">${thoatHtml(m.cauVanBanKetQua)}</div>` : ''}
      ${m.ketQua && !m.cauVanBanKetQua ? `<div style="font-size:.76rem">${thoatHtml(m.ketQua)}</div>` : ''}
      ${m.tienDoHienTai ? `<div style="font-size:.76rem"><i>Tiến độ:</i> ${thoatHtml(m.tienDoHienTai)}</div>` : ''}
      ${m.khoKhan ? `<div style="font-size:.76rem;color:var(--cdc-red)"><i>Khó khăn:</i> ${thoatHtml(m.khoKhan)}</div>` : ''}
    </div>`).join('');
  return `<div class="cdc-m-card"><div class="cdc-m-card__title">${tieuDe} (${ds.length})</div>${dong}</div>`;
}

async function xuLyXemBaoCao() {
  const dt = layDinhDanhHienTai();
  let thamSo;
  try {
    thamSo = layThamSoKy();
  } catch (loi) { thongBaoLoi(loi); return; }

  hienThiDangTai();
  try {
    const bc = await goiApi('layBaoCao', {
      loaiKy: $('rpLoaiKy').value,
      thamSo: JSON.stringify(thamSo),
      nguoiTao: dt ? dt.hoTen : ''
    });
    const nd = bc.noiDung;
    $('rpKetQua').innerHTML = `
      <div class="cdc-m-card">
        <div class="cdc-m-card__title">📌 ${thoatHtml(nd.khoang.nhan)}</div>
        <div style="font-size:.78rem;color:var(--cdc-gray-500)">Kỳ tới: ${thoatHtml(nd.kyToi.nhan)}</div>
      </div>
      ${renderMucBaoCao('✅ I.1. Hoàn thành trong kỳ', nd.dsHoanThanh, 'done')}
      ${renderMucBaoCao('🔄 I.2. Đang thực hiện', nd.dsDangThucHien)}
      ${renderMucBaoCao('⚠️ I.3. Chậm tiến độ', nd.dsChamTienDo, 'late')}
      ${renderMucBaoCao('✅ I.4. Việc phát sinh đã hoàn thành', nd.dsPhatSinhHoanThanh, 'done')}
      ${renderMucBaoCao('📋 II.1. Đến hạn kỳ tới', nd.denHanKyToi)}
      ${renderMucBaoCao('📋 II.2. Việc phát sinh chưa xong', nd.phatSinhChuaXong)}
      ${renderMucBaoCao('🚩 II.3. Cần Ban Giám đốc chỉ đạo', nd.canChiDao, 'late')}
      ${(!nd.dsHoanThanh.length && !nd.dsDangThucHien.length && !nd.dsChamTienDo.length && !nd.dsPhatSinhHoanThanh.length)
        ? '<div class="cdc-m-empty">Không có lượt cập nhật nào trong kỳ này.</div>' : ''}`;
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= KHỞI ĐỘNG ============================= */

async function taiDuLieuKhoiTao() {
  hienThiDangTai();
  try {
    const duLieu = await goiApi('layDuLieuKhoiTao');
    CDC_NHIEM_VU = duLieu.nhiemVu || [];
    CDC_DANH_MUC = duLieu.danhMuc || CDC_DANH_MUC;
    capNhatBadgeNguoiDung();
    capNhatNutScope();
    if (!layDinhDanhHienTai()) moSheetDinhDanh();
    renderTrangHienTai();
  } catch (loi) {
    thongBaoLoi('Không thể tải dữ liệu: ' + ((loi && loi.message) || loi));
    $('dsSapDenHan').innerHTML = $('dsNhiemVu').innerHTML =
      '<div class="cdc-m-empty-state"><div class="icon">📡</div>Không tải được dữ liệu.<br><br><button class="cdc-m-btn cdc-m-btn--outline" onclick="taiDuLieuKhoiTao()" style="width:auto;padding:.5rem 1.2rem">Thử lại</button></div>';
  } finally {
    anDangTai();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  /* Điều hướng tab */
  document.querySelectorAll('.cdc-m-tab').forEach((el) => {
    el.addEventListener('click', () => chuyenTrang(el.dataset.page));
  });

  /* Đóng sheet */
  document.querySelectorAll('[data-close-sheet]').forEach((el) => {
    el.addEventListener('click', () => $(el.dataset.closeSheet).classList.remove('show'));
  });

  /* Định danh */
  $('formDinhDanh').addEventListener('submit', xuLySubmitDinhDanh);
  $('btnDoiNguoiDung').addEventListener('click', () => { xoaDinhDanh(); capNhatBadgeNguoiDung(); moSheetDinhDanh(); });

  /* Nhiệm vụ: tìm kiếm + chip lọc trạng thái */
  $('taskSearch').addEventListener('input', (e) => { locTuKhoa = e.target.value.trim(); renderDsNhiemVu(); });
  document.querySelectorAll('#chipTrangThai .cdc-m-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#chipTrangThai .cdc-m-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      locTrangThai = chip.dataset.trangThai;
      renderDsNhiemVu();
    });
  });

  /* Cập nhật tiến độ */
  $('cnDaHoanThanh').addEventListener('change', xuLyDoiDaHoanThanh);
  $('formCapNhat').addEventListener('submit', xuLySubmitCapNhat);

  /* Báo cáo */
  $('rpLoaiKy').addEventListener('change', xuLyDoiLoaiKy);
  $('btnXemBaoCao').addEventListener('click', xuLyXemBaoCao);
  $('rpThamSoTuan').valueAsDate = new Date();
  $('rpThamSoQuyNam').value = $('rpThamSoNam').value = new Date().getFullYear();

  /* Offline banner */
  window.addEventListener('online', () => { capNhatBannerOffline(); taiDuLieuKhoiTao(); });
  window.addEventListener('offline', capNhatBannerOffline);
  $('btnThuLaiOffline').addEventListener('click', taiDuLieuKhoiTao);
  capNhatBannerOffline();

  /* Service worker */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* không chặn app nếu đăng ký SW thất bại */ });
  }

  taiDuLieuKhoiTao();
});
