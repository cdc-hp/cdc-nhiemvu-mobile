/* ===================================================================
   CDC Hải Phòng — Quản lý Nhiệm vụ & Báo cáo (bản di động / PWA)
   Gọi API JSON của BCtuan (Code.gs -> xuLyYeuCauApiDiDong_) qua fetch.
   Cấu trúc dữ liệu nhiệm vụ/danh mục/chỉ tiêu GIỐNG HỆT bản desktop (dạng
   lồng nhau từ TaskService/ChiTieuService) — xem src/frontend/*.js.html.
   =================================================================== */

'use strict';

const API_BASE_URL = (window.CDC_MOBILE_CONFIG && window.CDC_MOBILE_CONFIG.API_BASE_URL) || '';
const IDENTITY_KEY = 'cdcTaskIdentity';
const DANH_DAU_KEY = 'cdcDanhDauNhiemVu'; // cùng key với bản desktop (js.html) — đánh dấu cá nhân lưu tại trình duyệt
const NGUONG_SAP_DEN_HAN_NGAY = 3; // khớp dashboard.js.html bản desktop
const NGUON_GIAO_BAN_TRUNG_TAM = 'Giao ban Trung tâm';
const NGUON_GIAO_BAN_SO_Y_TE = 'Giao ban Sở Y tế';

/** Các khoa/phòng có quyền xem TOÀN BỘ nhiệm vụ — khớp DON_VI_QUYEN_TOAN_BO ở Common.gs. */
const DON_VI_QUYEN_TOAN_BO = ['Phòng Kế hoạch - Nghiệp vụ', 'Ban Giám đốc'];

let CDC_NHIEM_VU = [];
let CDC_DANH_MUC = { donVi: [], nguonGiao: [], loaiVanBanGiao: [], loaiVanBanKetQua: [], mucUuTien: [], quanTri: [] };
let CDC_CHI_TIEU = [];
let _daTaiDuLieuChiTieu = false;

/* Bộ lọc trang Nhiệm vụ */
let _locDangChon = 'TAT_CA'; // mã lọc cây trạng thái (giống submenu desktop)
let locTuKhoa = '';

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

/** Chuyển input[type=date] (yyyy-mm-dd) sang chuỗi ISO ngày — Utils.gs (server) chấp nhận thẳng chuỗi này. */
function ngayInputSangIso(gtInput) {
  return gtInput || '';
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
const thongBaoCanhBao = (m) => toast(m, 'warning');

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

/** Cùng quy tắc coQuyenSuaChiTieu() của chitieu.js.html desktop. */
function coQuyenSuaChiTieu(ct) {
  const dt = layDinhDanhHienTai();
  if (!dt) return false;
  if (coQuyenXemToanBo()) return true;
  return ct.donViThucHien === dt.khoaPhong;
}

/* ============================= ĐÁNH DẤU NHIỆM VỤ (bookmark cá nhân) ============================= */

function layDanhSachDanhDau() {
  try {
    const raw = localStorage.getItem(DANH_DAU_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function daDuocDanhDau(maNhiemVu) { return layDanhSachDanhDau().indexOf(maNhiemVu) !== -1; }
function toggleDanhDau(maNhiemVu) {
  const ds = layDanhSachDanhDau();
  const idx = ds.indexOf(maNhiemVu);
  if (idx === -1) ds.push(maNhiemVu); else ds.splice(idx, 1);
  localStorage.setItem(DANH_DAU_KEY, JSON.stringify(ds));
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
  capNhatGiaoDienTheoQuyen();
  renderTrangHienTai();
}

/* ============================= ĐIỀU HƯỚNG TAB ============================= */

let trangHienTai = 'dashboard';
let _daXemBaoCaoLanDau = false; // tự xem trước báo cáo tuần hiện tại khi vào tab Báo cáo lần đầu (giống bản desktop)

function chuyenTrang(tenTrang) {
  trangHienTai = tenTrang;
  document.querySelectorAll('.cdc-m-view').forEach((el) => el.classList.remove('active'));
  $('view-' + tenTrang).classList.add('active');
  document.querySelectorAll('.cdc-m-tab').forEach((el) => el.classList.toggle('active', el.dataset.page === tenTrang));
  window.scrollTo({ top: 0 });
  capNhatFab();

  if (tenTrang === 'chitieu' && !_daTaiDuLieuChiTieu) { khoiTaoTrangChiTieu(); return; }
  if (tenTrang === 'admin' && !_daKhoiTaoAdmin) { khoiTaoTrangAdmin(); return; }
  if (tenTrang === 'reports' && !_daXemBaoCaoLanDau) { _daXemBaoCaoLanDau = true; xuLyXemBaoCao(); return; }
  renderTrangHienTai();
}

function renderTrangHienTai() {
  if (trangHienTai === 'dashboard') renderDashboard();
  else if (trangHienTai === 'tasks') renderDsNhiemVu();
  else if (trangHienTai === 'chitieu') renderDsChiTieu();
  /* reports/admin: render riêng khi mở */
}

/* ============================= FAB (nút thêm nổi) ============================= */

function capNhatFab() {
  const fab = $('btnFab');
  if (trangHienTai === 'tasks') {
    fab.style.display = '';
    fab.dataset.mode = 'tasks';
  } else if (trangHienTai === 'chitieu' && coQuyenXemToanBo()) {
    fab.style.display = '';
    fab.dataset.mode = 'chitieu';
  } else {
    fab.style.display = 'none';
  }
}

function xuLyClickFab() {
  const mode = $('btnFab').dataset.mode;
  if (mode === 'chitieu') { moSheetBanHanhChiTieu(); return; }
  if (mode === 'tasks') {
    if (coQuyenXemToanBo()) {
      $('fabGiaoBan').style.display = '';
      $('fabMenu').classList.add('show');
    } else {
      moSheetTaoNhiemVu();
    }
  }
}

/* ============================= PHẠM VI DỮ LIỆU THEO ĐỊNH DANH ============================= */

function dsNhiemVuTheoPhamVi() {
  const dt = layDinhDanhHienTai();
  if (!dt) return CDC_NHIEM_VU;
  if (coQuyenXemToanBo()) return CDC_NHIEM_VU;
  return CDC_NHIEM_VU.filter((nv) => nv.donViThucHien === dt.khoaPhong);
}

function dsChiTieuTheoPhamVi() {
  const dt = layDinhDanhHienTai();
  if (!dt) return CDC_CHI_TIEU;
  if (coQuyenXemToanBo()) return CDC_CHI_TIEU;
  return CDC_CHI_TIEU.filter((ct) => ct.donViThucHien === dt.khoaPhong);
}

/** Cập nhật banner "đang xem phạm vi..." + ẩn/hiện bộ lọc & nút riêng cho quyền toàn bộ (Nhiệm vụ + Chỉ tiêu). */
function capNhatGiaoDienTheoQuyen() {
  const toanBo = coQuyenXemToanBo();
  const dt = layDinhDanhHienTai();

  const bannerNv = $('bannerPhamViXem');
  if (!toanBo && dt) {
    bannerNv.style.display = '';
    bannerNv.innerHTML = `👁️ Đang xem nhiệm vụ của <b>${thoatHtml(dt.khoaPhong)}</b>. Phòng KHNV/Ban Giám đốc xem được toàn bộ.`;
  } else {
    bannerNv.style.display = 'none';
  }

  const bannerCt = $('bannerPhamViXemChiTieu');
  if (!toanBo && dt) {
    bannerCt.style.display = '';
    bannerCt.innerHTML = `👁️ Đang xem chỉ tiêu của <b>${thoatHtml(dt.khoaPhong)}</b>. Phòng KHNV/Ban Giám đốc xem được toàn bộ.`;
  } else {
    bannerCt.style.display = 'none';
  }

  $('ctFilterDonViKhoi').style.display = toanBo ? '' : 'none';
  capNhatFab();
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

/* ============================= NHIỆM VỤ: TUẦN/THÁNG/QUÝ (giống task.js.html desktop) ============================= */

/**
 * Sinh danh sách các mốc tuần theo lịch (Thứ 2 → Chủ nhật) trong 1 tháng dương lịch.
 * Tuần 1 bắt đầu từ ngày 1 (có thể ngắn hơn 7 ngày); tuần cuối có thể kéo dài sang
 * đầu tháng sau nhưng vẫn thuộc tháng này (nhãn theo tháng của Thứ 2 bắt đầu tuần).
 */
function sinhDanhSachTuanTrongThang(nam, thang) {
  const ngayDauThang = new Date(nam, thang - 1, 1);
  const ngayCuoiThang = new Date(nam, thang, 0);
  const thu2Bang0 = (ngayDauThang.getDay() + 6) % 7;
  const chuNhatDau = new Date(nam, thang - 1, 1 + (6 - thu2Bang0));

  const dsTuan = [{ start: ngayDauThang, end: chuNhatDau }];
  let batDau = new Date(chuNhatDau);
  batDau.setDate(batDau.getDate() + 1);
  while (batDau <= ngayCuoiThang) {
    const ketThuc = new Date(batDau);
    ketThuc.setDate(ketThuc.getDate() + 6);
    dsTuan.push({ start: batDau, end: ketThuc });
    batDau = new Date(ketThuc);
    batDau.setDate(batDau.getDate() + 1);
  }
  return dsTuan;
}

function layMaTuanTrongThangCuaNgay(ngay) {
  const ngayChuan = new Date(ngay.getFullYear(), ngay.getMonth(), ngay.getDate());
  const nam = ngayChuan.getFullYear(), thang = ngayChuan.getMonth() + 1;
  const dsTuan = sinhDanhSachTuanTrongThang(nam, thang);
  const idx = dsTuan.findIndex((t) => ngayChuan >= t.start && ngayChuan <= t.end);
  return `${nam}-M${String(thang).padStart(2, '0')}-W${idx + 1}`;
}
function layMaThangCuaNgay(ngay) { return `${ngay.getFullYear()}-M${String(ngay.getMonth() + 1).padStart(2, '0')}`; }
function layMaQuyCuaNgay(ngay) { return `${ngay.getFullYear()}-Q${Math.floor(ngay.getMonth() / 3) + 1}`; }

function layDanhSachNamCoDuLieu() {
  const nams = new Set([new Date().getFullYear()]);
  CDC_NHIEM_VU.forEach((nv) => {
    if (nv.hanHoanThanh) nams.add(new Date(nv.hanHoanThanh).getFullYear());
    (nv.lichSuCapNhat || []).forEach((cn) => { if (cn.ngayCapNhat) nams.add(new Date(cn.ngayCapNhat).getFullYear()); });
  });
  return Array.from(nams).sort((a, b) => a - b);
}

function sinhTuyChonKyBaoCao(loai) {
  const tuyChon = [];
  layDanhSachNamCoDuLieu().forEach((nam) => {
    if (loai === 'THANG') {
      for (let thang = 1; thang <= 12; thang++) {
        tuyChon.push({ value: layMaThangCuaNgay(new Date(nam, thang - 1, 1)), label: `Tháng ${thang}/${nam}` });
      }
    } else if (loai === 'QUY') {
      for (let q = 1; q <= 4; q++) tuyChon.push({ value: `${nam}-Q${q}`, label: `Quý ${q}/${nam}` });
    }
  });
  return tuyChon;
}

/** Lấy lượt cập nhật gần nhất của 1 nhiệm vụ. */
function layCapNhatGanNhat(nv) {
  if (!nv.lichSuCapNhat || !nv.lichSuCapNhat.length) return null;
  return nv.lichSuCapNhat[nv.lichSuCapNhat.length - 1];
}

/** Phân loại 1 nhiệm vụ ĐÃ HOÀN THÀNH là đúng hạn/quá hạn/không có hạn — giống task.js.html desktop. */
function phanLoaiHoanThanh(nv) {
  const cn = layCapNhatGanNhat(nv);
  if (!cn || !cn.daHoanThanh) return null;
  if (!nv.hanHoanThanh) return 'KHONG_CO_HAN';
  const han = new Date(nv.hanHoanThanh); han.setHours(0, 0, 0, 0);
  const xong = new Date(cn.ngayHoanThanh || cn.ngayCapNhat); xong.setHours(0, 0, 0, 0);
  return xong > han ? 'QUA_HAN' : 'DUNG_HAN';
}

/** Cây trạng thái lọc — mã _locDangChon — giống hệt task.js.html desktop (khopVoiLocCayDanhMuc). */
function khopVoiLocCayTrangThai(nv) {
  if (_locDangChon === 'TAT_CA') return true;
  if (_locDangChon === 'DUOC_DANH_DAU') return daDuocDanhDau(nv.id);

  const tt = nv.trangThai;
  const chuaHoanThanh = tt !== 'Hoàn thành';
  const conLai = nv.hanHoanThanh ? soNgayConLai(nv.hanHoanThanh) : null;

  switch (_locDangChon) {
    case 'DANG_THUC_HIEN': return chuaHoanThanh;
    case 'HOAN_THANH': return !chuaHoanThanh;
    case 'DTH_QUA_HAN': return chuaHoanThanh && conLai !== null && conLai < 0;
    case 'DTH_TRONG_HAN': return chuaHoanThanh && conLai !== null && conLai >= 0;
    case 'DTH_KHONG_CO_HAN': return chuaHoanThanh && !nv.hanHoanThanh;
    case 'DTH_KHONG_CO_HAN_3T': {
      if (!(chuaHoanThanh && !nv.hanHoanThanh)) return false;
      const ngayGiao = nv.ngayGiao ? new Date(nv.ngayGiao) : null;
      return !!ngayGiao && (Date.now() - ngayGiao.getTime()) >= 90 * 24 * 60 * 60 * 1000;
    }
    case 'HT_DUNG_HAN': return phanLoaiHoanThanh(nv) === 'DUNG_HAN';
    case 'HT_QUA_HAN': return phanLoaiHoanThanh(nv) === 'QUA_HAN';
    case 'HT_KHONG_CO_HAN': return phanLoaiHoanThanh(nv) === 'KHONG_CO_HAN';
    default: return true;
  }
}

/* ============================= BỘ LỌC NHIỆM VỤ (sheet) ============================= */

function khoiTaoBoLocNhiemVu() {
  const $donVi = $('flDonVi');
  $donVi.innerHTML = '<option value="">Tất cả</option>' + CDC_DANH_MUC.donVi.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  const $nguonGiao = $('flNguonGiao');
  $nguonGiao.innerHTML = '<option value="">Tất cả</option>' + CDC_DANH_MUC.nguonGiao.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  const $mucUuTien = $('flMucUuTien');
  $mucUuTien.innerHTML = '<option value="">Tất cả</option>' + CDC_DANH_MUC.mucUuTien.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
}

function capNhatDanhSachKyTrongBoLoc() {
  const loai = $('flLoaiKy').value;
  $('flKyKhoi').style.display = (loai === 'THANG' || loai === 'QUY') ? '' : 'none';
  $('flTuanKhoi').style.display = loai === 'TUAN' ? '' : 'none';

  const $ky = $('flKy');
  $ky.innerHTML = '<option value="">Tất cả</option>';
  if (loai === 'THANG' || loai === 'QUY') {
    sinhTuyChonKyBaoCao(loai).forEach((tc) => { $ky.innerHTML += `<option value="${tc.value}">${thoatHtml(tc.label)}</option>`; });
  }

  const $thang = $('flTuanThang');
  $thang.innerHTML = '<option value="">Chọn tháng...</option>';
  if (loai === 'TUAN') {
    sinhTuyChonKyBaoCao('THANG').forEach((tc) => { $thang.innerHTML += `<option value="${tc.value}">${thoatHtml(tc.label)}</option>`; });
  }
  $('flTuanTuan').innerHTML = '<option value="">Tất cả</option>';
}

function capNhatDanhSachTuanTrongBoLoc() {
  const maThang = $('flTuanThang').value;
  const $tuan = $('flTuanTuan');
  $tuan.innerHTML = '<option value="">Tất cả</option>';
  if (!maThang) return;
  const [namStr, thangStr] = maThang.split('-M');
  sinhDanhSachTuanTrongThang(Number(namStr), Number(thangStr)).forEach((tuan, i) => {
    const nhan = `Tuần ${i + 1} (${dinhDangNgay(tuan.start).slice(0, 5)} - ${dinhDangNgay(tuan.end).slice(0, 5)})`;
    $tuan.innerHTML += `<option value="${namStr}-M${thangStr}-W${i + 1}">${thoatHtml(nhan)}</option>`;
  });
}

/** Nhiệm vụ có khớp bộ lọc chi tiết (đơn vị/nguồn giao/người phụ trách/mức ưu tiên/kỳ báo cáo) hay không. */
function khopVoiBoLocChiTiet(nv) {
  const donVi = $('flDonVi').value;
  if (donVi && nv.donViThucHien !== donVi) return false;

  const nguonGiao = $('flNguonGiao').value;
  if (nguonGiao && nv.nguonGiao !== nguonGiao) return false;

  const nguoiPhuTrach = $('flNguoiPhuTrach').value.trim().toLowerCase();
  if (nguoiPhuTrach && !String(nv.nguoiPhuTrach || '').toLowerCase().includes(nguoiPhuTrach)) return false;

  const mucUuTien = $('flMucUuTien').value;
  if (mucUuTien && nv.mucUuTien !== mucUuTien) return false;

  const loaiKy = $('flLoaiKy').value;
  const maKy = loaiKy === 'TUAN' ? $('flTuanTuan').value : $('flKy').value;
  if (loaiKy && maKy) {
    const capNhat = layCapNhatGanNhat(nv);
    if (!capNhat) return false;
    const ngayCapNhat = new Date(capNhat.ngayCapNhat);
    const maKyNv = loaiKy === 'THANG' ? layMaThangCuaNgay(ngayCapNhat)
      : loaiKy === 'QUY' ? layMaQuyCuaNgay(ngayCapNhat)
      : layMaTuanTrongThangCuaNgay(ngayCapNhat);
    if (maKyNv !== maKy) return false;
  }
  return true;
}

function xoaBoLocChiTiet() {
  $('flDonVi').value = ''; $('flNguonGiao').value = ''; $('flNguoiPhuTrach').value = ''; $('flMucUuTien').value = '';
  $('flLoaiKy').value = '';
  capNhatDanhSachKyTrongBoLoc();
}

/* ============================= DANH SÁCH NHIỆM VỤ ============================= */

function renderDsNhiemVu() {
  let ds = dsNhiemVuTheoPhamVi();
  ds = ds.filter((nv) => khopVoiLocCayTrangThai(nv) && khopVoiBoLocChiTiet(nv));
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
    <div class="cdc-m-task-item" data-task-id="${thoatHtml(nv.id)}">
      <button class="cdc-m-star-btn${daDuocDanhDau(nv.id) ? ' active' : ''}" data-star-id="${thoatHtml(nv.id)}" title="Đánh dấu">${daDuocDanhDau(nv.id) ? '★' : '☆'}</button>
      <div class="cdc-m-task-item__top">
        <span><span class="cdc-m-code">${thoatHtml(nv.id)}</span><span class="${lopCssUuTien(nv.mucUuTien)}" style="font-size:.7rem">${thoatHtml(nv.mucUuTien)}</span></span>
        <span class="cdc-m-pill ${lopCssTrangThai(nv.trangThai)}">${thoatHtml(nv.trangThai)}</span>
      </div>
      <div class="cdc-m-task-item__title">${thoatHtml(nv.trichYeu)}</div>
      <div class="cdc-m-task-item__meta">
        <span>🏢 ${thoatHtml(nv.donViThucHien)}</span>
        <span>👤 ${thoatHtml(nv.nguoiPhuTrach) || '—'}</span>
        <span>📅 Hạn: ${dinhDangNgay(nv.hanHoanThanh)}</span>
      </div>
    </div>`).join('');
  khung.querySelectorAll('[data-task-id]').forEach((el) => {
    el.addEventListener('click', (evt) => {
      if (evt.target.closest('[data-star-id]')) return;
      moChiTietNhiemVu(el.dataset.taskId);
    });
  });
  khung.querySelectorAll('[data-star-id]').forEach((el) => {
    el.addEventListener('click', (evt) => {
      evt.stopPropagation();
      toggleDanhDau(el.dataset.starId);
      renderDsNhiemVu();
    });
  });
}

/* ============================= CHI TIẾT NHIỆM VỤ ============================= */

function moChiTietNhiemVu(maNhiemVu) {
  const nv = CDC_NHIEM_VU.find((x) => x.id === maNhiemVu);
  if (!nv) { thongBaoLoi('Không tìm thấy nhiệm vụ ' + maNhiemVu); return; }

  $('ctTieuDe').textContent = nv.id;

  const lichSu = (nv.lichSuCapNhat || []).slice().reverse();
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
      <div class="cdc-m-task-item__title" style="font-size:.95rem;padding-right:0">${thoatHtml(nv.trichYeu)}</div>
      <div class="cdc-m-info-grid" style="margin-top:.7rem">
        <div><div class="k">Nguồn giao</div>${thoatHtml(nv.nguonGiao)}</div>
        ${nv.loaiVanBanGiao ? `<div><div class="k">Văn bản giao</div>${thoatHtml(nv.loaiVanBanGiao)} ${thoatHtml(nv.soKyHieuVanBan || '')} ${nv.ngayBanHanhVanBan ? '· ' + dinhDangNgay(nv.ngayBanHanhVanBan) : ''}</div>` : ''}
        <div><div class="k">Ngày giao</div>${dinhDangNgay(nv.ngayGiao)}</div>
        <div><div class="k">Hạn hoàn thành</div>${dinhDangNgay(nv.hanHoanThanh)}</div>
        <div><div class="k">Đơn vị thực hiện</div>${thoatHtml(nv.donViThucHien)}</div>
        <div><div class="k">Người phụ trách</div>${thoatHtml(nv.nguoiPhuTrach) || '—'}</div>
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
  if (daHoanThanh && !$('cnNgayHoanThanh').value) { thongBaoLoi('Vui lòng chọn ngày hoàn thành.'); return; }

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

/* ============================= TẠO NHIỆM VỤ MỚI ============================= */

function moSheetTaoNhiemVu() {
  $('fabMenu').classList.remove('show');
  $('formTaoNhiemVu').reset();

  $('tvNguonGiao').innerHTML = CDC_DANH_MUC.nguonGiao.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('tvMucUuTien').innerHTML = CDC_DANH_MUC.mucUuTien.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('tvLoaiVanBanGiao').innerHTML = '<option value="">Chọn loại văn bản...</option>' + CDC_DANH_MUC.loaiVanBanGiao.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('tvDonViThucHien').innerHTML = '<option value="">Chọn đơn vị...</option>' + CDC_DANH_MUC.donVi.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('tvNgayGiao').valueAsDate = new Date();

  $('sheetTaoNhiemVu').classList.add('show');
}

async function xuLySubmitTaoNhiemVu(evt) {
  evt.preventDefault();

  const donViThucHien = $('tvDonViThucHien').value;
  const nguonGiao = $('tvNguonGiao').value;
  const mucUuTien = $('tvMucUuTien').value;
  const trichYeu = $('tvTrichYeu').value.trim();
  const nguoiPhuTrach = $('tvNguoiPhuTrach').value.trim();
  const hanHoanThanh = $('tvHanHoanThanh').value;
  const ngayGiao = $('tvNgayGiao').value;

  if (!donViThucHien || !nguonGiao || !mucUuTien || !trichYeu || !nguoiPhuTrach || !hanHoanThanh || !ngayGiao) {
    thongBaoLoi('Vui lòng nhập đầy đủ các trường bắt buộc (*).');
    return;
  }

  const input = {
    ngayGiao, nguonGiao,
    loaiVanBanGiao: $('tvLoaiVanBanGiao').value || '',
    soKyHieuVanBan: $('tvSoKyHieuVanBan').value.trim(),
    ngayBanHanhVanBan: $('tvNgayBanHanhVanBan').value || '',
    trichYeu, donViThucHien, nguoiPhuTrach, hanHoanThanh, mucUuTien,
    laViecPhatSinh: $('tvLaViecPhatSinh').checked
  };

  hienThiDangTai();
  try {
    const nvMoi = await goiApi('taoNhiemVuMoi', input, true);
    CDC_NHIEM_VU.push(nvMoi);
    $('sheetTaoNhiemVu').classList.remove('show');
    thongBaoThanhCong('Đã tạo nhiệm vụ mới.');
    renderTrangHienTai();
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= GIAO NHIỆM VỤ TỪ GIAO BAN (nhiều dòng) ============================= */

let _dongGiaoBanDem = 0;

function themDongGiaoBan() {
  const id = ++_dongGiaoBanDem;
  const div = document.createElement('div');
  div.className = 'cdc-m-row-card';
  div.dataset.dongId = String(id);
  div.innerHTML = `
    <div class="cdc-m-row-card__header">
      <span class="cdc-m-row-card__index">Dòng ${id}</span>
      <button type="button" class="cdc-m-row-card__remove" data-remove-gb>🗑</button>
    </div>
    <div class="cdc-m-field"><label>Tên nhiệm vụ <span class="req">*</span></label><input type="text" class="gb-ten-nhiem-vu" placeholder="Nhập tên nhiệm vụ..."></div>
    <div class="cdc-m-field"><label>Đơn vị thực hiện <span class="req">*</span></label><select class="gb-don-vi"><option value="">Chọn đơn vị...</option>${CDC_DANH_MUC.donVi.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('')}</select></div>
    <div class="cdc-m-field"><label>Người phụ trách <span class="cdc-m-hint-inline">(không bắt buộc)</span></label><input type="text" class="gb-nguoi-phu-trach" placeholder="Không bắt buộc..."></div>
    <div class="cdc-m-field"><label>Hạn hoàn thành <span class="req">*</span></label><input type="date" class="gb-han-hoan-thanh"></div>`;
  $('dsDongGiaoBan').appendChild(div);
  div.querySelectorAll('input, select').forEach((el) => {
    el.style.width = '100%'; el.style.border = '1px solid var(--cdc-gray-200)'; el.style.borderRadius = 'var(--cdc-radius)';
    el.style.padding = '.55rem .7rem'; el.style.fontSize = '.86rem'; el.style.background = '#fff';
  });
  div.querySelector('[data-remove-gb]').addEventListener('click', () => {
    if ($('dsDongGiaoBan').children.length <= 1) { thongBaoCanhBao('Cần giữ lại ít nhất 1 dòng nhiệm vụ.'); return; }
    div.remove();
  });
}

function moSheetGiaoBan() {
  $('fabMenu').classList.remove('show');
  $('formGiaoBan').reset();
  $('dsDongGiaoBan').innerHTML = '';
  _dongGiaoBanDem = 0;

  const giaoBanValues = CDC_DANH_MUC.nguonGiao.filter((v) => v.indexOf('Giao ban') === 0);
  $('gbNguonGiao').innerHTML = (giaoBanValues.length ? giaoBanValues : CDC_DANH_MUC.nguonGiao).map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('gbMucUuTien').innerHTML = CDC_DANH_MUC.mucUuTien.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('gbLoaiVanBanGiao').innerHTML = '<option value="">Chọn loại văn bản...</option>' + CDC_DANH_MUC.loaiVanBanGiao.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('gbNgayGiao').valueAsDate = new Date();

  themDongGiaoBan();
  $('sheetGiaoBan').classList.add('show');
}

async function xuLySubmitGiaoBan(evt) {
  evt.preventDefault();

  const nguonGiao = $('gbNguonGiao').value;
  const mucUuTien = $('gbMucUuTien').value;
  const ngayGiao = $('gbNgayGiao').value;
  if (!nguonGiao || !mucUuTien || !ngayGiao) {
    thongBaoLoi('Vui lòng nhập đầy đủ Nguồn giao, Ngày giao ban và Mức độ ưu tiên.');
    return;
  }

  const dsNhiemVu = [];
  let thieuTruong = false;
  $('dsDongGiaoBan').querySelectorAll('.cdc-m-row-card').forEach((div) => {
    const trichYeu = div.querySelector('.gb-ten-nhiem-vu').value.trim();
    const donViThucHien = div.querySelector('.gb-don-vi').value;
    const nguoiPhuTrach = div.querySelector('.gb-nguoi-phu-trach').value.trim();
    const hanHoanThanh = div.querySelector('.gb-han-hoan-thanh').value;
    if (!trichYeu && !donViThucHien && !nguoiPhuTrach && !hanHoanThanh) return;
    if (!trichYeu || !donViThucHien || !hanHoanThanh) { thieuTruong = true; return; }
    dsNhiemVu.push({ trichYeu, donViThucHien, nguoiPhuTrach, hanHoanThanh });
  });

  if (thieuTruong) { thongBaoLoi('Vui lòng nhập đầy đủ Tên nhiệm vụ, Đơn vị thực hiện và Hạn hoàn thành ở mỗi dòng đã điền, hoặc xoá dòng chưa dùng.'); return; }
  if (!dsNhiemVu.length) { thongBaoLoi('Vui lòng nhập ít nhất 1 nhiệm vụ.'); return; }

  const input = {
    ngayGiao, nguonGiao, mucUuTien,
    loaiVanBanGiao: $('gbLoaiVanBanGiao').value || '',
    soKyHieuVanBan: $('gbSoKyHieuVanBan').value.trim(),
    ngayBanHanhVanBan: $('gbNgayBanHanhVanBan').value || '',
    dsNhiemVu
  };

  hienThiDangTai();
  try {
    const dsNhiemVuMoi = await goiApi('taoNhiemVuHangLoat', input, true);
    dsNhiemVuMoi.forEach((nv) => CDC_NHIEM_VU.push(nv));
    $('sheetGiaoBan').classList.remove('show');
    thongBaoThanhCong(`Đã tạo ${dsNhiemVuMoi.length} nhiệm vụ từ giao ban.`);
    renderTrangHienTai();
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= CHỈ TIÊU KẾ HOẠCH ============================= */

function tinhQuyHienTai() {
  const d = new Date();
  return { quy: Math.floor(d.getMonth() / 3) + 1, nam: d.getFullYear() };
}
function layCapNhatChiTieuGanNhat(ct) {
  if (!ct.lichSuCapNhat || !ct.lichSuCapNhat.length) return null;
  return ct.lichSuCapNhat[ct.lichSuCapNhat.length - 1];
}
function dinhDangNhanQuy(quyBaoCao) {
  const [nam, q] = String(quyBaoCao || '').split('-Q');
  return q ? `Quý ${q}/${nam}` : (quyBaoCao || '');
}
function layKetQuaTaiQuy(ct, quyGioiHan) {
  const ds = (ct.lichSuCapNhat || []).filter((cn) => cn.quyBaoCao <= quyGioiHan).sort((a, b) => a.quyBaoCao.localeCompare(b.quyBaoCao));
  return ds.length ? ds[ds.length - 1] : null;
}

async function khoiTaoTrangChiTieu() {
  hienThiDangTai();
  try {
    const duLieu = await goiApi('layDuLieuKhoiTaoChiTieu');
    CDC_CHI_TIEU = duLieu.chiTieu || [];
    _daTaiDuLieuChiTieu = true;

    const namNay = new Date().getFullYear();
    const $nam = $('ctFilterNam');
    $nam.innerHTML = '<option value="">Tất cả các năm</option>';
    for (let n = namNay + 1; n >= namNay - 2; n--) $nam.innerHTML += `<option value="${n}"${n === namNay ? ' selected' : ''}>Năm ${n}</option>`;
    $('ctFilterDonVi').innerHTML = '<option value="">Tất cả</option>' + CDC_DANH_MUC.donVi.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');

    capNhatGiaoDienTheoQuyen();
    renderDsChiTieu();
  } catch (loi) {
    thongBaoLoi('Không thể tải dữ liệu chỉ tiêu: ' + ((loi && loi.message) || loi));
  } finally {
    anDangTai();
  }
}

function renderDsChiTieu() {
  let ds = dsChiTieuTheoPhamVi();
  const nam = $('ctFilterNam').value;
  if (nam) ds = ds.filter((ct) => Number(ct.nam) === Number(nam));
  const donVi = $('ctFilterDonVi').value;
  if (donVi) ds = ds.filter((ct) => ct.donViThucHien === donVi);

  const khung = $('dsChiTieu');
  if (!ds.length) { khung.innerHTML = '<div class="cdc-m-empty">Không có chỉ tiêu nào phù hợp.</div>'; return; }

  khung.innerHTML = ds.map((ct) => {
    const cn = layCapNhatChiTieuGanNhat(ct);
    return `
    <div class="cdc-m-task-item" data-ct-id="${thoatHtml(ct.id)}">
      <div class="cdc-m-task-item__top">
        <span class="cdc-m-code">${thoatHtml(ct.id)}</span>
        <span class="cdc-m-pill cdc-m-pill--new">${ct.nam}</span>
      </div>
      <div class="cdc-m-task-item__title">${thoatHtml(ct.tenChiTieu)}</div>
      <div class="cdc-m-task-item__meta">
        <span>🏢 ${thoatHtml(ct.donViThucHien)}</span>
        <span>🎯 KH: ${thoatHtml(ct.keHoach)} ${thoatHtml(ct.donViTinh)}</span>
      </div>
      <div style="font-size:.78rem;margin-top:.4rem">
        ${cn ? `<span class="cdc-m-pill cdc-m-pill--doing">${dinhDangNhanQuy(cn.quyBaoCao)}</span> ${thoatHtml(cn.ketQuaThucHien)}` : '<span style="color:var(--cdc-gray-500)">Chưa cập nhật</span>'}
      </div>
    </div>`;
  }).join('');
  khung.querySelectorAll('[data-ct-id]').forEach((el) => {
    el.addEventListener('click', () => moChiTietChiTieu(el.dataset.ctId));
  });
}

function moChiTietChiTieu(maChiTieu) {
  const ct = CDC_CHI_TIEU.find((x) => x.id === maChiTieu);
  if (!ct) return;
  _maChiTieuDangXem = maChiTieu;

  $('cttTieuDe').textContent = ct.tenChiTieu;
  const lichSu = (ct.lichSuCapNhat || []).slice().reverse();
  const htmlLichSu = lichSu.length
    ? '<div class="cdc-m-timeline">' + lichSu.map((cn) => `
        <div class="cdc-m-timeline-item">
          <div class="cdc-m-timeline-item__meta">${dinhDangNgay(cn.ngayCapNhat)} · ${thoatHtml(cn.nguoiCapNhat)} · <b>${dinhDangNhanQuy(cn.quyBaoCao)}</b></div>
          <div><b>Kết quả luỹ kế:</b> ${thoatHtml(cn.ketQuaThucHien)}</div>
          ${cn.ghiChu ? `<div style="color:var(--cdc-red)"><b>Ghi chú:</b> ${thoatHtml(cn.ghiChu)}</div>` : ''}
        </div>`).join('') + '</div>'
    : '<div class="cdc-m-empty">Chưa có lượt báo cáo tiến độ nào.</div>';

  $('cttNoiDung').innerHTML = `
    <div class="cdc-m-card">
      <div class="cdc-m-info-grid">
        <div><div class="k">Năm</div>${ct.nam}</div>
        <div><div class="k">Đơn vị tính</div>${thoatHtml(ct.donViTinh)}</div>
        <div><div class="k">Kế hoạch thực hiện</div>${thoatHtml(ct.keHoach)}</div>
        <div><div class="k">Đơn vị thực hiện</div>${thoatHtml(ct.donViThucHien)}</div>
      </div>
      ${coQuyenSuaChiTieu(ct) ? `<button class="cdc-m-btn cdc-m-btn--primary" id="btnMoCapNhatCt">✏️ Báo cáo tiến độ quý</button>` : ''}
    </div>
    <div class="cdc-m-card">
      <div class="cdc-m-card__title">🕘 Lịch sử báo cáo tiến độ theo quý</div>
      ${htmlLichSu}
    </div>`;

  const btn = $('btnMoCapNhatCt');
  if (btn) btn.addEventListener('click', () => { $('sheetChiTietChiTieu').classList.remove('show'); moFormCapNhatChiTieu(ct); });

  $('sheetChiTietChiTieu').classList.add('show');
}

let _maChiTieuDangXem = null;

function moFormCapNhatChiTieu(ct) {
  const dt = layDinhDanhHienTai();
  if (!dt) { moSheetDinhDanh(); return; }
  if (!coQuyenSuaChiTieu(ct)) { thongBaoLoi('Bạn không có quyền báo cáo tiến độ chỉ tiêu này.'); return; }

  $('formCapNhatChiTieu').reset();
  $('cnctMaChiTieu').value = ct.id;
  $('cnctTenChiTieu').innerHTML = `<span class="cdc-m-code">${thoatHtml(ct.id)}</span> ${thoatHtml(ct.tenChiTieu)}`;
  $('cnctKeHoachThamChieu').textContent = `${ct.keHoach} ${ct.donViTinh}`;
  $('cnctNguoiCapNhat').value = `${dt.hoTen} — ${dt.khoaPhong}`;

  const hienTai = tinhQuyHienTai();
  const $quy = $('cnctQuyBaoCao');
  $quy.innerHTML = '';
  for (let q = 1; q <= 4; q++) {
    const ma = `${ct.nam}-Q${q}`;
    const macDinh = Number(ct.nam) === hienTai.nam ? q === hienTai.quy : q === 1;
    $quy.innerHTML += `<option value="${ma}"${macDinh ? ' selected' : ''}>Quý ${q}/${ct.nam}</option>`;
  }

  $('sheetCapNhatChiTieu').classList.add('show');
}

async function xuLySubmitCapNhatChiTieu(evt) {
  evt.preventDefault();
  const ketQuaThucHien = $('cnctKetQuaThucHien').value.trim();
  if (!ketQuaThucHien) { thongBaoLoi('Vui lòng nhập kết quả thực hiện luỹ kế.'); return; }

  const dt = layDinhDanhHienTai();
  const input = {
    maChiTieu: $('cnctMaChiTieu').value,
    nguoiCapNhat: dt ? `${dt.hoTen} (${dt.khoaPhong})` : 'Ẩn danh',
    khoaPhongNguoiCapNhat: dt ? dt.khoaPhong : '',
    hoTenNguoiCapNhat: dt ? dt.hoTen : '',
    quyBaoCao: $('cnctQuyBaoCao').value,
    ketQuaThucHien,
    ghiChu: $('cnctGhiChu').value.trim()
  };

  hienThiDangTai();
  try {
    const ctMoi = await goiApi('capNhatTienDoChiTieu', input, true);
    const idx = CDC_CHI_TIEU.findIndex((x) => x.id === ctMoi.id);
    if (idx !== -1) CDC_CHI_TIEU[idx] = ctMoi;
    $('sheetCapNhatChiTieu').classList.remove('show');
    thongBaoThanhCong('Đã lưu báo cáo tiến độ quý.');
    renderDsChiTieu();
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= BAN HÀNH CHỈ TIÊU (nhiều dòng) ============================= */

let _dongChiTieuDem = 0;

function themDongChiTieu() {
  const id = ++_dongChiTieuDem;
  const div = document.createElement('div');
  div.className = 'cdc-m-row-card';
  div.dataset.dongId = String(id);
  div.innerHTML = `
    <div class="cdc-m-row-card__header">
      <span class="cdc-m-row-card__index">Dòng ${id}</span>
      <button type="button" class="cdc-m-row-card__remove" data-remove-ct>🗑</button>
    </div>
    <div class="cdc-m-field"><label>Tên chỉ tiêu <span class="req">*</span></label><input type="text" class="ctb-ten-chi-tieu" placeholder="Nhập tên chỉ tiêu..."></div>
    <div class="cdc-m-field"><label>Đơn vị tính <span class="req">*</span></label><input type="text" class="ctb-don-vi-tinh" placeholder="Vd: %, người, lượt..."></div>
    <div class="cdc-m-field"><label>Kế hoạch thực hiện <span class="req">*</span></label><input type="text" class="ctb-ke-hoach" placeholder="Vd: 95%, 500..."></div>`;
  $('dsDongChiTieu').appendChild(div);
  div.querySelectorAll('input').forEach((el) => {
    el.style.width = '100%'; el.style.border = '1px solid var(--cdc-gray-200)'; el.style.borderRadius = 'var(--cdc-radius)';
    el.style.padding = '.55rem .7rem'; el.style.fontSize = '.86rem'; el.style.background = '#fff';
  });
  div.querySelector('[data-remove-ct]').addEventListener('click', () => {
    if ($('dsDongChiTieu').children.length <= 1) { thongBaoCanhBao('Cần giữ lại ít nhất 1 dòng chỉ tiêu.'); return; }
    div.remove();
  });
}

function moSheetBanHanhChiTieu() {
  $('formBanHanhChiTieu').reset();
  $('dsDongChiTieu').innerHTML = '';
  _dongChiTieuDem = 0;

  const namHienTai = new Date().getFullYear();
  const $nam = $('ctbNam');
  $nam.innerHTML = '';
  for (let n = namHienTai; n <= namHienTai + 1; n++) $nam.innerHTML += `<option value="${n}">Năm ${n}</option>`;
  $('ctbDonViThucHien').innerHTML = '<option value="">Chọn đơn vị...</option>' + CDC_DANH_MUC.donVi.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');

  themDongChiTieu();
  $('sheetBanHanhChiTieu').classList.add('show');
}

async function xuLySubmitBanHanhChiTieu(evt) {
  evt.preventDefault();
  const nam = $('ctbNam').value;
  const donViThucHien = $('ctbDonViThucHien').value;
  if (!nam || !donViThucHien) { thongBaoLoi('Vui lòng chọn năm áp dụng và đơn vị thực hiện.'); return; }

  const dsChiTieu = [];
  let thieuTruong = false;
  $('dsDongChiTieu').querySelectorAll('.cdc-m-row-card').forEach((div) => {
    const tenChiTieu = div.querySelector('.ctb-ten-chi-tieu').value.trim();
    const donViTinh = div.querySelector('.ctb-don-vi-tinh').value.trim();
    const keHoach = div.querySelector('.ctb-ke-hoach').value.trim();
    if (!tenChiTieu && !donViTinh && !keHoach) return;
    if (!tenChiTieu || !donViTinh || !keHoach) { thieuTruong = true; return; }
    dsChiTieu.push({ tenChiTieu, donViTinh, keHoach });
  });

  if (thieuTruong) { thongBaoLoi('Vui lòng nhập đầy đủ 3 trường bắt buộc ở mỗi dòng đã điền, hoặc xoá dòng chưa dùng.'); return; }
  if (!dsChiTieu.length) { thongBaoLoi('Vui lòng nhập ít nhất 1 chỉ tiêu.'); return; }

  hienThiDangTai();
  try {
    const dsChiTieuMoi = await goiApi('taoChiTieuHangLoat', { nam, donViThucHien, dsChiTieu }, true);
    dsChiTieuMoi.forEach((ct) => CDC_CHI_TIEU.push(ct));
    $('sheetBanHanhChiTieu').classList.remove('show');
    thongBaoThanhCong(`Đã ban hành ${dsChiTieuMoi.length} chỉ tiêu.`);
    renderDsChiTieu();
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= BÁO CÁO TỔNG HỢP ============================= */

function xuLyDoiLoaiKy() {
  const loaiKy = $('rpLoaiKy').value;
  $('rpThamSoTuanWrap').style.display = loaiKy === 'TUAN' ? '' : 'none';
  $('rpThamSoThangWrap').style.display = loaiKy === 'THANG' ? '' : 'none';
  $('rpThamSoQuyWrap').style.display = loaiKy === 'QUY' ? '' : 'none';
  $('rpThamSoQuyNamWrap').style.display = loaiKy === 'QUY' ? '' : 'none';
  $('rpThamSoNamWrap').style.display = loaiKy === 'NAM' ? '' : 'none';
}

function layThamSoKy() {
  const loaiKy = $('rpLoaiKy').value;
  if (loaiKy === 'TUAN') {
    const d = $('rpThamSoTuan').value;
    if (!d) throw new Error('Vui lòng chọn 1 ngày trong tuần cần xem.');
    return d;
  }
  if (loaiKy === 'THANG') {
    const t = $('rpThamSoThang').value;
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
  if (!ds || !ds.length) return `<div class="cdc-m-card"><div class="cdc-m-card__title">${tieuDe} (0)</div><p class="cdc-m-empty" style="padding:.5rem 0">Không có.</p></div>`;
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

async function khoiTaoBoLocBaoCaoTongHop() {
  $('rpDonVi').innerHTML = '<option value="">Tất cả</option>' + CDC_DANH_MUC.donVi.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
  $('rpNguonGiao').innerHTML = '<option value="">Tất cả</option>' + CDC_DANH_MUC.nguonGiao.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
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
      nguoiTao: dt ? dt.hoTen : '',
      donVi: $('rpDonVi').value,
      nguonGiao: $('rpNguonGiao').value
    });
    const nd = bc.noiDung;

    const dangThucHienPhatSinh = nd.dsDangThucHien.filter((m) => m.laViecPhatSinh).length;
    const chamTienDoPhatSinh = nd.dsChamTienDo.filter((m) => m.laViecPhatSinh).length;
    const dangThucHienThuong = nd.dsDangThucHien.length - dangThucHienPhatSinh;
    const chamTienDoThuong = nd.dsChamTienDo.length - chamTienDoPhatSinh;
    const soThuongTrongKy = nd.dsHoanThanh.length + dangThucHienThuong + chamTienDoThuong;
    const soPhatSinhTrongKy = nd.dsPhatSinhHoanThanh.length + dangThucHienPhatSinh + chamTienDoPhatSinh;
    const nhanTyLe = (soLuong, tongSo) => tongSo > 0 ? ` (${soLuong}/${tongSo})` : '';

    const hoanThanhGiaoBanTT = nd.dsHoanThanh.filter((m) => m.nguonGiao === NGUON_GIAO_BAN_TRUNG_TAM);
    const hoanThanhGiaoBanSo = nd.dsHoanThanh.filter((m) => m.nguonGiao === NGUON_GIAO_BAN_SO_Y_TE);
    const hoanThanhKhac = nd.dsHoanThanh.filter((m) => m.nguonGiao !== NGUON_GIAO_BAN_TRUNG_TAM && m.nguonGiao !== NGUON_GIAO_BAN_SO_Y_TE);

    $('rpKetQua').innerHTML = `
      <div class="cdc-m-card">
        <div class="cdc-m-card__title">📌 ${thoatHtml(nd.khoang.nhan)}${nd.donVi ? ' — ' + thoatHtml(nd.donVi) : ''}${nd.nguonGiao ? ' — ' + thoatHtml(nd.nguonGiao) : ''}</div>
        <div style="font-size:.78rem;color:var(--cdc-gray-500)">Kỳ tới: ${thoatHtml(nd.kyToi.nhan)}</div>
      </div>
      ${renderMucBaoCao('✅ 1a. Hoàn thành — Giao ban Trung tâm' + nhanTyLe(hoanThanhGiaoBanTT.length, soThuongTrongKy), hoanThanhGiaoBanTT, 'done')}
      ${renderMucBaoCao('✅ 1b. Hoàn thành — Giao ban Sở Y tế' + nhanTyLe(hoanThanhGiaoBanSo.length, soThuongTrongKy), hoanThanhGiaoBanSo, 'done')}
      ${renderMucBaoCao('✅ 1c. Hoàn thành — Nguồn khác' + nhanTyLe(hoanThanhKhac.length, soThuongTrongKy), hoanThanhKhac, 'done')}
      ${renderMucBaoCao('🔄 2. Đang thực hiện', nd.dsDangThucHien)}
      ${renderMucBaoCao('⚠️ 3. Chậm tiến độ', nd.dsChamTienDo, 'late')}
      ${renderMucBaoCao('✅ 4. Việc phát sinh đã hoàn thành' + nhanTyLe(nd.dsPhatSinhHoanThanh.length, soPhatSinhTrongKy), nd.dsPhatSinhHoanThanh, 'done')}
      ${renderMucBaoCao('📋 II.1. Các nhiệm vụ chưa hoàn thành', nd.chuaHoanThanh)}
      ${renderMucBaoCao('📋 II.2. Đến hạn kỳ tới', nd.denHanKyToi)}
      ${renderMucBaoCao('📋 II.3. Việc phát sinh chưa xong', nd.phatSinhChuaXong)}
      ${renderMucBaoCao('🚩 II.4. Cần Ban Giám đốc chỉ đạo', nd.canChiDao, 'late')}`;
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= XUẤT BÁO CÁO RA FILE WORD (.docx) ============================= */
/* Khớp mẫu Tuần (Giao ban Sở Y tế) và mẫu Tháng (Kết quả thực hiện nhiệm vụ công tác
   trọng tâm), gọi action xuatBaoCaoTuanDocx/xuatBaoCaoThangDocx (Code.gs ->
   ReportDocxService.gs) — CÙNG action bản desktop gọi qua google.script.run. */

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Chuyển chuỗi base64 -> Blob rồi tải xuống trình duyệt (dùng chung cho mọi file xuất ra). */
function taiXuongTepBase64(base64, tenTep, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = tenTep;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Xuất báo cáo (Tuần/Tháng) đang chọn ra file Word — luôn tổng hợp toàn Trung tâm. */
async function xuatBaoCaoDocx() {
  const loaiKy = $('rpLoaiKy').value;
  if (loaiKy !== 'TUAN' && loaiKy !== 'THANG') {
    thongBaoCanhBao('Xuất Word hiện chỉ hỗ trợ Báo cáo Tuần và Báo cáo Tháng.');
    return;
  }
  let thamSo;
  try { thamSo = layThamSoKy(); } catch (loi) { thongBaoLoi(loi); return; }
  const dt = layDinhDanhHienTai();
  const nguoiTao = dt ? `${dt.hoTen} (${dt.khoaPhong})` : 'Ẩn danh';

  hienThiDangTai();
  try {
    const action = loaiKy === 'TUAN' ? 'xuatBaoCaoTuanDocx' : 'xuatBaoCaoThangDocx';
    const ketQua = await goiApi(action, { thamSo, nguoiTao }, true);
    taiXuongTepBase64(ketQua.base64, ketQua.tenTep, MIME_DOCX);
    thongBaoThanhCong('Đã xuất file Word.');
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

/* ============================= BÁO CÁO CHỈ TIÊU ============================= */

async function khoiTaoBoLocBaoCaoChiTieu() {
  const namNay = new Date().getFullYear();
  const hienTai = tinhQuyHienTai();
  const $nam = $('rpctNam');
  $nam.innerHTML = '';
  for (let n = namNay + 1; n >= namNay - 2; n--) $nam.innerHTML += `<option value="${n}"${n === namNay ? ' selected' : ''}>Năm ${n}</option>`;

  const $quy = $('rpctQuy');
  $quy.innerHTML = '';
  for (let q = 1; q <= 4; q++) $quy.innerHTML += `<option value="${q}"${q === hienTai.quy ? ' selected' : ''}>Quý ${q}</option>`;

  $('rpctDonVi').innerHTML = '<option value="">Tất cả</option>' + CDC_DANH_MUC.donVi.map((v) => `<option value="${thoatHtml(v)}">${thoatHtml(v)}</option>`).join('');
}

async function xuLyXemBaoCaoChiTieu() {
  hienThiDangTai();
  try {
    if (!_daTaiDuLieuChiTieu) {
      const duLieu = await goiApi('layDuLieuKhoiTaoChiTieu');
      CDC_CHI_TIEU = duLieu.chiTieu || [];
      _daTaiDuLieuChiTieu = true;
    }
    renderBaoCaoChiTieu();
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

function renderBaoCaoChiTieu() {
  const nam = Number($('rpctNam').value);
  const quy = Number($('rpctQuy').value);
  const donVi = $('rpctDonVi').value;
  const quyGioiHan = `${nam}-Q${quy}`;

  let ds = CDC_CHI_TIEU.filter((ct) => Number(ct.nam) === nam);
  if (donVi) ds = ds.filter((ct) => ct.donViThucHien === donVi);

  const theoDonVi = {};
  ds.forEach((ct) => { (theoDonVi[ct.donViThucHien] = theoDonVi[ct.donViThucHien] || []).push(ct); });
  const dsDonVi = Object.keys(theoDonVi).sort();

  if (!dsDonVi.length) {
    $('rpctKetQua').innerHTML = '<div class="cdc-m-empty">Không có chỉ tiêu nào phù hợp.</div>';
    return;
  }

  $('rpctKetQua').innerHTML = dsDonVi.map((tenDonVi) => {
    const hang = theoDonVi[tenDonVi].map((ct) => {
      const kq = layKetQuaTaiQuy(ct, quyGioiHan);
      return `
      <div style="border-left:3px solid var(--cdc-blue-100);padding:.3rem .6rem;margin-bottom:.4rem;font-size:.82rem">
        <div><b>${thoatHtml(ct.tenChiTieu)}</b></div>
        <div style="font-size:.72rem;color:var(--cdc-gray-500)">KH: ${thoatHtml(ct.keHoach)} ${thoatHtml(ct.donViTinh)}</div>
        <div>${kq ? thoatHtml(kq.ketQuaThucHien) : '<span style="color:var(--cdc-gray-500)">Chưa cập nhật</span>'}${kq && kq.quyBaoCao !== quyGioiHan ? ` <span style="font-size:.7rem;color:var(--cdc-gray-500)">(số liệu ${dinhDangNhanQuy(kq.quyBaoCao)})</span>` : ''}</div>
      </div>`;
    }).join('');
    return `<div class="cdc-m-card"><div class="cdc-m-card__title">🏢 ${thoatHtml(tenDonVi)}</div>${hang}</div>`;
  }).join('');
}

/* ============================= QUẢN TRỊ DANH MỤC ============================= */

const CDC_TEN_LOAI_DANH_MUC = {
  DON_VI: 'Đơn vị thực hiện', NGUON_GIAO: 'Nguồn giao',
  LOAI_VAN_BAN_GIAO: 'Loại văn bản giao', LOAI_VAN_BAN_KETQUA: 'Loại văn bản kết quả', MUC_UU_TIEN: 'Mức độ ưu tiên',
  QUAN_TRI: 'Quản trị viên toàn quyền'
};
const CDC_LOAI_SANG_KEY_DANH_MUC = {
  DON_VI: 'donVi', NGUON_GIAO: 'nguonGiao', LOAI_VAN_BAN_GIAO: 'loaiVanBanGiao',
  LOAI_VAN_BAN_KETQUA: 'loaiVanBanKetQua', MUC_UU_TIEN: 'mucUuTien', QUAN_TRI: 'quanTri'
};
let _loaiDanhMucDangXem = 'DON_VI';
let _dsDanhMucHienTai = [];
let _daKhoiTaoAdmin = false;

async function khoiTaoTrangAdmin() {
  _daKhoiTaoAdmin = true;
  document.querySelectorAll('#chipLoaiDanhMuc .cdc-m-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#chipLoaiDanhMuc .cdc-m-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      _loaiDanhMucDangXem = chip.dataset.loai;
      taiVaRenderDanhMuc();
    });
  });
  await taiVaRenderDanhMuc();
}

async function taiVaRenderDanhMuc() {
  hienThiDangTai();
  try {
    _dsDanhMucHienTai = await goiApi('layDanhMucQuanTri', { loai: _loaiDanhMucDangXem });
    renderDsDanhMuc();
    const key = CDC_LOAI_SANG_KEY_DANH_MUC[_loaiDanhMucDangXem];
    if (key) {
      CDC_DANH_MUC[key] = [..._dsDanhMucHienTai]
        .filter((dm) => dm.dangSuDung)
        .sort((a, b) => (Number(a.thuTu) || 0) - (Number(b.thuTu) || 0))
        .map((dm) => dm.giaTri);
    }
  } catch (loi) {
    thongBaoLoi(loi);
  } finally {
    anDangTai();
  }
}

function renderDsDanhMuc() {
  $('adminGhiChuQuanTri').style.display = _loaiDanhMucDangXem === 'QUAN_TRI' ? '' : 'none';
  const ds = [..._dsDanhMucHienTai].sort((a, b) => (Number(a.thuTu) || 0) - (Number(b.thuTu) || 0));
  const khung = $('dsDanhMuc');
  if (!ds.length) { khung.innerHTML = '<div class="cdc-m-empty">Chưa có giá trị nào.</div>'; return; }

  khung.innerHTML = ds.map((dm) => `
    <div class="cdc-m-dm-item">
      <div class="cdc-m-dm-item__main">
        <div class="cdc-m-dm-item__value">${thoatHtml(dm.giaTri)}</div>
        <div class="cdc-m-dm-item__meta">Thứ tự ${dm.thuTu} · ${dm.dangSuDung ? '<span style="color:var(--cdc-green)">Đang dùng</span>' : '<span style="color:var(--cdc-gray-500)">Đã ẩn</span>'}</div>
      </div>
      <div class="cdc-m-dm-item__actions">
        <button data-sua-dm="${thoatHtml(dm.id)}" title="Sửa">✏️</button>
        <button data-an-dm="${thoatHtml(dm.id)}" title="${dm.dangSuDung ? 'Ẩn' : 'Hiện lại'}">${dm.dangSuDung ? '🙈' : '👁️'}</button>
      </div>
    </div>`).join('');

  khung.querySelectorAll('[data-sua-dm]').forEach((el) => el.addEventListener('click', () => moSheetDanhMuc(el.dataset.suaDm)));
  khung.querySelectorAll('[data-an-dm]').forEach((el) => el.addEventListener('click', async () => {
    hienThiDangTai();
    try {
      await goiApi('anHienDanhMuc', { id: el.dataset.anDm }, true);
      await taiVaRenderDanhMuc();
      thongBaoThanhCong('Đã cập nhật trạng thái.');
    } catch (loi) { thongBaoLoi(loi); } finally { anDangTai(); }
  }));
}

function moSheetDanhMuc(id) {
  $('formDanhMuc').reset();
  $('dmId').value = '';
  $('dmDangSuDung').checked = true;

  if (id) {
    const dm = _dsDanhMucHienTai.find((x) => x.id === id);
    $('dmTieuDe').textContent = 'Sửa giá trị danh mục';
    $('dmId').value = dm.id;
    $('dmGiaTri').value = dm.giaTri;
    $('dmThuTu').value = dm.thuTu;
    $('dmDangSuDung').checked = dm.dangSuDung;
  } else {
    $('dmTieuDe').textContent = 'Thêm giá trị — ' + CDC_TEN_LOAI_DANH_MUC[_loaiDanhMucDangXem];
    $('dmThuTu').value = _dsDanhMucHienTai.length + 1;
  }
  $('sheetDanhMuc').classList.add('show');
}

async function xuLySubmitDanhMuc(evt) {
  evt.preventDefault();
  const id = $('dmId').value;
  const giaTri = $('dmGiaTri').value.trim();
  const thuTu = Number($('dmThuTu').value) || 1;
  const dangSuDung = $('dmDangSuDung').checked;
  if (!giaTri) { thongBaoLoi('Vui lòng nhập giá trị danh mục.'); return; }

  const input = { loai: _loaiDanhMucDangXem, giaTri, thuTu, dangSuDung };

  hienThiDangTai();
  try {
    if (id) await goiApi('suaDanhMuc', { id, input }, true);
    else await goiApi('themDanhMuc', input, true);
    await taiVaRenderDanhMuc();
    $('sheetDanhMuc').classList.remove('show');
    thongBaoThanhCong('Đã lưu giá trị danh mục.');
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
    capNhatGiaoDienTheoQuyen();
    khoiTaoBoLocNhiemVu();
    capNhatDanhSachKyTrongBoLoc();
    khoiTaoBoLocBaoCaoTongHop();
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

  /* Nhiệm vụ: tìm kiếm + cây trạng thái */
  $('taskSearch').addEventListener('input', (e) => { locTuKhoa = e.target.value.trim(); renderDsNhiemVu(); });
  document.querySelectorAll('#chipTrangThai .cdc-m-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#chipTrangThai .cdc-m-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      _locDangChon = chip.dataset.loc;
      renderDsNhiemVu();
    });
  });

  /* Bộ lọc nhiệm vụ (sheet) */
  $('btnMoBoLocNhiemVu').addEventListener('click', () => $('sheetBoLoc').classList.add('show'));
  $('flLoaiKy').addEventListener('change', capNhatDanhSachKyTrongBoLoc);
  $('flTuanThang').addEventListener('change', capNhatDanhSachTuanTrongBoLoc);
  $('btnApDungBoLoc').addEventListener('click', () => { $('sheetBoLoc').classList.remove('show'); renderDsNhiemVu(); });
  $('btnXoaBoLocNhiemVu').addEventListener('click', () => { xoaBoLocChiTiet(); renderDsNhiemVu(); });

  /* FAB */
  $('btnFab').addEventListener('click', xuLyClickFab);
  $('fabMenu').addEventListener('click', (e) => { if (e.target === $('fabMenu')) $('fabMenu').classList.remove('show'); });
  $('fabTaoNhiemVu').addEventListener('click', moSheetTaoNhiemVu);
  $('fabGiaoBan').addEventListener('click', moSheetGiaoBan);

  /* Tạo nhiệm vụ mới / Giao ban */
  $('formTaoNhiemVu').addEventListener('submit', xuLySubmitTaoNhiemVu);
  $('btnThemDongGiaoBan').addEventListener('click', themDongGiaoBan);
  $('formGiaoBan').addEventListener('submit', xuLySubmitGiaoBan);

  /* Cập nhật tiến độ nhiệm vụ */
  $('cnDaHoanThanh').addEventListener('change', xuLyDoiDaHoanThanh);
  $('formCapNhat').addEventListener('submit', xuLySubmitCapNhat);

  /* Chỉ tiêu kế hoạch */
  $('ctFilterNam').addEventListener('change', renderDsChiTieu);
  $('ctFilterDonVi').addEventListener('change', renderDsChiTieu);
  $('formCapNhatChiTieu').addEventListener('submit', xuLySubmitCapNhatChiTieu);
  $('btnThemDongChiTieu').addEventListener('click', themDongChiTieu);
  $('formBanHanhChiTieu').addEventListener('submit', xuLySubmitBanHanhChiTieu);

  /* Báo cáo: sub-tab */
  document.querySelectorAll('.cdc-m-subtab').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.cdc-m-subtab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.cdc-m-subview').forEach((v) => v.classList.remove('active'));
      $('rp-' + btn.dataset.subtab).classList.add('active');
      if (btn.dataset.subtab === 'chitieu' && !$('rpctNam').options.length) {
        await khoiTaoBoLocBaoCaoChiTieu();
        await xuLyXemBaoCaoChiTieu();
      }
    });
  });
  $('rpLoaiKy').addEventListener('change', xuLyDoiLoaiKy);
  $('btnXemBaoCao').addEventListener('click', xuLyXemBaoCao);
  $('btnXuatDocx').addEventListener('click', xuatBaoCaoDocx);
  $('rpThamSoTuan').valueAsDate = new Date();
  $('rpThamSoQuyNam').value = $('rpThamSoNam').value = new Date().getFullYear();
  $('btnXemBaoCaoChiTieu').addEventListener('click', xuLyXemBaoCaoChiTieu);

  /* Quản trị danh mục */
  $('btnThemDanhMuc').addEventListener('click', () => moSheetDanhMuc(null));
  $('formDanhMuc').addEventListener('submit', xuLySubmitDanhMuc);

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
