"use client";
import { useState, useRef, useEffect } from 'react';
import { FaCalendarAlt, FaPlus, FaTrash, FaSearch, FaChevronDown } from 'react-icons/fa';
import {
  getDokter,
  getRuangan,
  getICD9,
  getICD10,
  getTarifRumahSakit,
  searchPasien,
  createBilling,
  type Dokter,
  type Ruangan,
  type ICD9,
  type ICD10,
  type TarifData,
  type BillingRequest,
  getBillingAktifByNama,
} from '@/lib/api-helper';

interface BillingPasienProps {
  onEditBilling?: (billingId: number, pasienName: string) => void;
}

const BillingPasien = ({ onEditBilling }: BillingPasienProps) => {
  // Form state
  const [namaPasien, setNamaPasien] = useState('');
  const [idPasien, setIdPasien] = useState('');
  const [usia, setUsia] = useState('');
  const [gender, setGender] = useState('Laki-Laki');
  const [ruangan, setRuangan] = useState('');
  const [kelas, setKelas] = useState('');
  const [tanggalMasuk, setTanggalMasuk] = useState('');
  const [tanggalKeluar, setTanggalKeluar] = useState('');
  const [dpjp, setDpjp] = useState('');
  const [caraBayar, setCaraBayar] = useState('BPJS');
  const [totalTarifRS, setTotalTarifRS] = useState(0);
  const [userRole, setUserRole] = useState<string>('');

  // Dropdown data
  const [dokterList, setDokterList] = useState<Dokter[]>([]);
  const [ruanganList, setRuanganList] = useState<Ruangan[]>([]);
  const [icd9List, setIcd9List] = useState<ICD9[]>([]);
  const [icd10List, setIcd10List] = useState<ICD10[]>([]);
  const [tarifRSList, setTarifRSList] = useState<TarifData[]>([]);

  // Selected items
  const [selectedTindakan, setSelectedTindakan] = useState<string[]>([]);
  const [selectedICD9, setSelectedICD9] = useState<string[]>([]);
  const [selectedICD10, setSelectedICD10] = useState<string[]>([]);

  // Billing history state (untuk menampilkan riwayat tindakan & ICD dari pasien)
  const [billingHistory, setBillingHistory] = useState<{
    tindakan_rs: string[];
    icd9: string[];
    icd10: string[];
    inacbg?: string[];
    total_tarif_rs: number;
    total_klaim?: number; // ← Added: Total_Tarif_BPJS dari DB (baseline untuk calculation)
    billingId?: number;
    tanggal_masuk?: string | null;
    tanggal_keluar?: string | null;
  } | null>(null);
  const [billingHistoryInfo, setBillingHistoryInfo] = useState('Belum ada data yang dimuat. Pilih pasien untuk melihat riwayat.');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchingPasien, setSearchingPasien] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [nameDropdownOpen, setNameDropdownOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper to compute billing_sign - compare Tarif RS vs Total Klaim BPJS
  const computeBillingSign = (tarif: number, totalKlaim: number): string => {
    const totalTarif = tarif || 0;
    const klaim = totalKlaim || 0;

    if (!klaim || klaim === 0) return '';
    const percentage = (totalTarif / klaim) * 100;

    if (percentage <= 25) {
      return "Hijau"; // Tarif RS <=25% dari Klaim BPJS Efektif = AMAN
    } else if (percentage <= 50) {
      return "Kuning"; // 26%-50% = PERLU PERHATIAN
    } else {
      return "Merah"; // >50% = WASPADA
    }
  };

  // Live display values (used in card)
  const totalKlaimBPJSLive = (billingHistory && billingHistory.total_klaim) ? billingHistory.total_klaim : 0;
  const liveBillingSign = computeBillingSign(totalTarifRS, totalKlaimBPJSLive);

  // Searchable dropdown state
  const [tindakanSearch, setTindakanSearch] = useState('');
  const [tindakanDropdownOpen, setTindakanDropdownOpen] = useState(false);
  const [tindakanJustClosed, setTindakanJustClosed] = useState(false);
  const [icd9Search, setIcd9Search] = useState('');
  const [icd9DropdownOpen, setIcd9DropdownOpen] = useState(false);
  const [icd9JustClosed, setIcd9JustClosed] = useState(false);
  const [icd10Search, setIcd10Search] = useState('');
  const [icd10DropdownOpen, setIcd10DropdownOpen] = useState(false);
  const [icd10JustClosed, setIcd10JustClosed] = useState(false);
  const [ruanganSearch, setRuanganSearch] = useState('');
  const [ruanganDropdownOpen, setRuanganDropdownOpen] = useState(false);
  const [ruanganJustClosed, setRuanganJustClosed] = useState(false);
  const [dpjpSearch, setDpjpSearch] = useState('');
  const [dpjpDropdownOpen, setDpjpDropdownOpen] = useState(false);
  const [dpjpJustClosed, setDpjpJustClosed] = useState(false);

  const dateMasukRef = useRef<HTMLInputElement>(null);
  const dateKeluarRef = useRef<HTMLInputElement>(null);
  const tindakanInputRef = useRef<HTMLInputElement>(null);
  const tindakanDropdownRef = useRef<HTMLDivElement>(null);
  const icd9InputRef = useRef<HTMLInputElement>(null);
  const icd9DropdownRef = useRef<HTMLDivElement>(null);
  const icd10InputRef = useRef<HTMLInputElement>(null);
  const icd10DropdownRef = useRef<HTMLDivElement>(null);
  const ruanganInputRef = useRef<HTMLInputElement>(null);
  const ruanganDropdownRef = useRef<HTMLDivElement>(null);
  const dpjpInputRef = useRef<HTMLInputElement>(null);
  const dpjpDropdownRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameDropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);

  // Set tanggal masuk otomatis dengan tanggal hari ini
  useEffect(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;
    setTanggalMasuk(todayString);
  }, []);

  // Set DPJP otomatis dengan dokter yang login setelah dokterList ter-load
  useEffect(() => {
    const dokterData = localStorage.getItem("dokter");
    if (dokterData && dokterList.length > 0) {
      try {
        const dokter = JSON.parse(dokterData);
        if (dokter.id && dokter.nama) {
          // Cari dokter di dokterList berdasarkan ID
          const foundDokter = dokterList.find(d => (d as any).ID_Dokter === dokter.id);
          if (foundDokter) {
            // Set DPJP dengan ID dokter
            setDpjp((foundDokter as any).ID_Dokter.toString());
            // Set search value dengan nama dokter
            setDpjpSearch((foundDokter as any).Nama_Dokter);
          } else {
            // Jika tidak ditemukan di list, tetap set dengan data dari localStorage
            setDpjp(dokter.id.toString());
            setDpjpSearch(dokter.nama);
          }
        }
      } catch (err) {
        console.error('Error parsing dokter data:', err);
      }
    }
  }, [dokterList]);

  // Fetch dropdown data on mount - TIDAK ADA AUTO SAVE
  // HANYA FETCH DATA DROPDOWN, TIDAK MEMANGGIL createBilling ATAU handleSubmit
  useEffect(() => {
    // Get user role
    const role = localStorage.getItem("userRole") || "";
    setUserRole(role);

    const fetchDropdownData = async () => {
      try {
        // Hanya fetch data dropdown, TIDAK save apapun
        const [dokterRes, ruanganRes, icd9Res, icd10Res, tarifRes] = await Promise.all([
          getDokter(),
          getRuangan(),
          getICD9(),
          getICD10(),
          getTarifRumahSakit(),
        ]);

        if (dokterRes.data) setDokterList(dokterRes.data);
        if (ruanganRes.data) setRuanganList(ruanganRes.data);
        if (icd9Res.data) setIcd9List(icd9Res.data);
        if (icd10Res.data) setIcd10List(icd10Res.data);
        if (tarifRes.data) setTarifRSList(tarifRes.data);
      } catch (err) {
        console.error('Error fetching dropdown data:', err);
        setError('Gagal memuat data dropdown');
      }
    };

    fetchDropdownData();
    // TIDAK ADA createBilling atau handleSubmit di sini
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      // Check for tindakan dropdown
      if (tindakanDropdownOpen) {
        const isClickInsideInput = tindakanInputRef.current?.contains(target);
        const isClickInsideDropdown = tindakanDropdownRef.current?.contains(target);
        if (!isClickInsideInput && !isClickInsideDropdown) {
          setTindakanDropdownOpen(false);
        }
      }

      // Check for ICD9 dropdown
      if (icd9DropdownOpen) {
        const isClickInsideInput = icd9InputRef.current?.contains(target);
        const isClickInsideDropdown = icd9DropdownRef.current?.contains(target);
        if (!isClickInsideInput && !isClickInsideDropdown) {
          setIcd9DropdownOpen(false);
        }
      }

      // Check for ICD10 dropdown
      if (icd10DropdownOpen) {
        const isClickInsideInput = icd10InputRef.current?.contains(target);
        const isClickInsideDropdown = icd10DropdownRef.current?.contains(target);
        if (!isClickInsideInput && !isClickInsideDropdown) {
          setIcd10DropdownOpen(false);
        }
      }

      // Check for Ruangan dropdown
      if (ruanganDropdownOpen) {
        const isClickInsideInput = ruanganInputRef.current?.contains(target);
        const isClickInsideDropdown = ruanganDropdownRef.current?.contains(target);
        if (!isClickInsideInput && !isClickInsideDropdown) {
          setRuanganDropdownOpen(false);
        }
      }

      // Check for DPJP dropdown
      if (dpjpDropdownOpen) {
        const isClickInsideInput = dpjpInputRef.current?.contains(target);
        const isClickInsideDropdown = dpjpDropdownRef.current?.contains(target);
        if (!isClickInsideInput && !isClickInsideDropdown) {
          setDpjpDropdownOpen(false);
        }
      }

      // Check for name (pasien) dropdown
      if (nameDropdownOpen) {
        const isClickInsideInput = nameInputRef.current?.contains(target);
        const isClickInsideDropdown = nameDropdownRef.current?.contains(target);
        if (!isClickInsideInput && !isClickInsideDropdown) {
          setNameDropdownOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [tindakanDropdownOpen, icd9DropdownOpen, icd10DropdownOpen, ruanganDropdownOpen, dpjpDropdownOpen, nameDropdownOpen]);

  // Helper function to set ruangan display text based on ID/name
  const setRuanganDisplay = (ruanganValue: string | number | undefined) => {
    if (!ruanganValue) {
      setRuangan('');
      setRuanganSearch('');
      return;
    }

    const ruanganStr = ruanganValue.toString().trim();
    if (!ruanganStr) {
      setRuangan('');
      setRuanganSearch('');
      return;
    }

    // Try to find by ID first
    const ruanganDataById = ruanganList.find(r => (r as any).ID_Ruangan?.toString() === ruanganStr);
    if (ruanganDataById) {
      setRuangan(ruanganStr);
      setRuanganSearch((ruanganDataById as any).Nama_Ruangan);
      console.log(`✅ Ruangan matched by ID: ${ruanganStr} → ${(ruanganDataById as any).Nama_Ruangan}`);
      return;
    }

    // Try to find by name if not found by ID
    const ruanganDataByName = ruanganList.find(r => 
      (r as any).Nama_Ruangan?.toLowerCase() === ruanganStr.toLowerCase()
    );
    if (ruanganDataByName) {
      setRuangan((ruanganDataByName as any).ID_Ruangan?.toString() || ruanganStr);
      setRuanganSearch((ruanganDataByName as any).Nama_Ruangan);
      console.log(`✅ Ruangan matched by name: ${ruanganStr} → ${(ruanganDataByName as any).Nama_Ruangan}`);
      return;
    }

    // If not found in list, assume it's already the display name
    setRuangan(ruanganStr);
    setRuanganSearch(ruanganStr);
    console.log(`⚠️ Ruangan not found in list, using as-is: ${ruanganStr}`);
  };

  // Helper function to set gender properly

  // Search pasien - HANYA MENGISI FORM, TIDAK SAVE
  const handleSearchPasien = async () => {
    if (!namaPasien.trim()) {
      setError('Masukkan nama pasien terlebih dahulu');
      return;
    }

    try {
      setSearchingPasien(true);
      setError('');
      const response = await searchPasien(namaPasien);

      if (response.error) {
        setError(response.error);
        setSearchResults([]);
        return;
      }

      if ((response.data as any)?.data) {
        setSearchResults((response.data as any).data);
        setNameDropdownOpen((response.data as any).data.length > 0);
        if ((response.data as any).data.length > 0) {
          // Hanya mengisi form dengan hasil pertama (saat tombol search diklik)
          const pasien = (response.data as any).data[0];
          setIdPasien(pasien.ID_Pasien.toString());
          setUsia(pasien.Usia.toString());
          setGender(pasien.Jenis_Kelamin);
          setKelas(pasien.Kelas);

          // Set ruangan dengan helper function
          setRuanganDisplay(pasien.Ruangan);

          // Load riwayat billing aktif (tindakan & ICD sebelumnya)
          await loadBillingAktifHistory(pasien.Nama_Pasien);
        }
      }
    } catch (err) {
      setError('Gagal mencari pasien');
      console.error(err);
    } finally {
      setSearchingPasien(false);
    }
  };

  // Load riwayat billing aktif untuk pasien
  const loadBillingAktifHistory = async (namaPasien: string) => {
    try {
      if (!namaPasien || !namaPasien.trim()) {
        setBillingHistory(null);
        setBillingHistoryInfo('Nama pasien tidak boleh kosong');
        setTotalTarifRS(0);
        return;
      }

      const res = await getBillingAktifByNama(namaPasien);

      console.log('Response dari getBillingAktifByNama:', res);
      console.log('📡 Full API Response:', JSON.stringify(res, null, 2));

      if (res.status === 404 || !res.data) {
        console.log('Tidak ada billing aktif untuk pasien ini');
        setBillingHistory(null);
        setBillingHistoryInfo('Tidak ada riwayat billing aktif untuk pasien ini.');
        setTotalTarifRS(0);
        return;
      }

      if (res.error) {
        throw new Error(res.error);
      }

      // Handle different response structures
      // Backend returns: { status: "success", data: { billing, tindakan_rs, icd9, icd10, dokter, inacbg_ri, inacbg_rj } }
      let billingData = res.data;
      
      // If the actual data is nested under .data property
      if ((res.data as any)?.data && typeof (res.data as any).data === 'object') {
        // Check if it's the nested structure from backend
        if ((res.data as any).data.billing !== undefined) {
          // This is the correct nested structure from backend
          billingData = (res.data as any).data;
        } else {
          // Otherwise just use res.data
          billingData = res.data;
        }
      }

      console.log('Billing data extracted:', billingData);

      // Safely extract arrays
      // Check both top-level and nested structure from backend
      const tindakan = Array.isArray((billingData as any)?.tindakan_rs) ? (billingData as any).tindakan_rs : 
                       Array.isArray((billingData as any)?.tindakan) ? (billingData as any).tindakan : [];
      const icd9 = Array.isArray((billingData as any)?.icd9) ? (billingData as any).icd9 : [];
      const icd10 = Array.isArray((billingData as any)?.icd10) ? (billingData as any).icd10 : [];
      const inacbgRI = Array.isArray((billingData as any)?.inacbg_ri) ? (billingData as any).inacbg_ri : [];
      const inacbgRJ = Array.isArray((billingData as any)?.inacbg_rj) ? (billingData as any).inacbg_rj : [];
      const inacbg = [...inacbgRI, ...inacbgRJ];

      console.log('Extracted arrays:', { tindakan: tindakan.length, icd9: icd9.length, icd10: icd10.length, inacbg: inacbg.length });
      console.log('Raw arrays:', { tindakan, icd9, icd10, inacbg });

      // Calculate total_tarif_rs dari tindakan_rs dengan lookup di tarifRSList
      let calculatedTotalTarif = 0;
      tindakan.forEach((deskripsi: string) => {
        const tarif = tarifRSList.find(t => (t as any).Deskripsi === deskripsi);
        if (tarif && (tarif as any).Harga) {
          calculatedTotalTarif += (tarif as any).Harga;
        }
      });

      // Prefer stored total_tarif_rs from backend billing object when available
      const billingObj = (billingData as any)?.billing || billingData;
      const storedTotalTarif = (billingObj as any)?.Total_Tarif_RS || (billingObj as any)?.total_tarif_rs || (billingObj as any)?.Total_Tarif || 0;
      const finalTotalTarif = storedTotalTarif && storedTotalTarif > 0 ? storedTotalTarif : calculatedTotalTarif;

      // Extract billing dates & total_klaim - check in billing object first, then top-level
      let tanggalMasuk = (billingObj as any)?.Tanggal_masuk || (billingObj as any)?.tanggal_masuk;
      let tanggalKeluar = (billingObj as any)?.Tanggal_keluar || (billingObj as any)?.tanggal_keluar;
      let totalKlaim = (billingObj as any)?.Total_Tarif_BPJS || (billingObj as any)?.total_klaim || 0;
      
      console.log('💾 Extracted dates & total_klaim:', { tanggalMasuk, tanggalKeluar, totalKlaim, billingObj });

      // Set billing history untuk ditampilkan di tabel saja
      if (tindakan.length > 0 || icd9.length > 0 || icd10.length > 0 || inacbg.length > 0) {
        const billingId = (billingData as any)?.ID_Billing || (billingData as any)?.id_billing || (billingObj as any)?.ID_Billing || (billingObj as any)?.id_billing;
        setBillingHistory({ tindakan_rs: tindakan, icd9, icd10, inacbg, total_tarif_rs: finalTotalTarif, total_klaim: totalKlaim, billingId, tanggal_masuk: tanggalMasuk, tanggal_keluar: tanggalKeluar });
        setBillingHistoryInfo('Riwayat billing aktif berhasil dimuat.');
      } else {
        setBillingHistory(null);
        setBillingHistoryInfo('Tidak ada riwayat billing aktif untuk pasien ini.');
      }

      console.log('Billing aktif history loaded:', { tindakan, icd9, icd10, inacbg, calculatedTotalTarif });
    } catch (err) {
      console.error('Error loading billing history:', err);
      setBillingHistory(null);
      setBillingHistoryInfo('Error: Gagal memload riwayat billing. ' + (err instanceof Error ? err.message : 'Silakan cek console untuk detail.'));
      setTotalTarifRS(0);
    }
  };

  // Debounced live search when typing patient name
  const onNameChange = (value: string) => {
    setNamaPasien(value);
    // clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // only search when 2+ chars
    if (value.trim().length < 2) {
      setSearchResults([]);
      setNameDropdownOpen(false);
      return;
    }

    // schedule search
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        setSearchingPasien(true);
        const res = await searchPasien(value);
        if (res.error) {
          setError(res.error);
          setSearchResults([]);
          setNameDropdownOpen(false);
        } else if ((res.data as any)?.data) {
          setSearchResults((res.data as any).data);
          setNameDropdownOpen((res.data as any).data.length > 0);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSearchingPasien(false);
      }
    }, 300);
  };

  // select pasien from suggestions and fill form, mapping gender
  const selectPasien = (pasien: any) => {
    if (!pasien) return;
    setNamaPasien(pasien.Nama_Pasien || '');
    setIdPasien(pasien.ID_Pasien?.toString() || '');
    setUsia(pasien.Usia?.toString() || '');

    // Map backend gender values to the form's labels
    const jk = (pasien.Jenis_Kelamin || '').toString().toLowerCase();
    if (jk.includes('laki') || jk.includes('pria')) {
      setGender('Laki-Laki');
    } else if (jk.includes('wanita') || jk.includes('perempuan')) {
      setGender('Perempuan');
    } else {
      setGender(pasien.Jenis_Kelamin || 'Laki-Laki');
    }

    setKelas(pasien.Kelas || '');

    // Set ruangan dengan helper function
    setRuanganDisplay(pasien.Ruangan);

    setSearchResults([]);
    setNameDropdownOpen(false);

    // Clear form fields (tindakan, ICD9, ICD10) saat select pasien baru
    // User harus input data fresh, tidak boleh carry-over dari pasien sebelumnya
    setSelectedTindakan([]);
    setSelectedICD9([]);
    setSelectedICD10([]);

    // Load riwayat billing aktif (untuk display di tabel + auto-fill total_tarif_rs)
    loadBillingAktifHistory(pasien.Nama_Pasien);
  };

  // Add tindakan - menyimpan Deskripsi (bukan KodeRS) karena backend mencari dengan Tindakan_RS (Deskripsi)
  const handleAddTindakan = (kode: string) => {
    const tarif = tarifRSList.find(t => (t as any).KodeRS === kode);
    if (tarif && (tarif as any).Deskripsi && !selectedTindakan.includes((tarif as any).Deskripsi)) {
      setSelectedTindakan([...selectedTindakan, (tarif as any).Deskripsi]);
      setTindakanSearch('');
      setTindakanDropdownOpen(false);
    }
  };

  // Calculate total tarif RS when tindakan changes
  // selectedTindakan menyimpan Deskripsi, jadi cari berdasarkan Deskripsi dan sum Harga
  // Display: history + tindakan baru | Kirim ke backend: hanya tindakan baru
  useEffect(() => {
    // Hitung total dari selectedTindakan saja
    const selectedTotal = selectedTindakan.reduce((sum, deskripsi) => {
      const tarif = tarifRSList.find(t => (t as any).Deskripsi === deskripsi);
      const harga = (tarif as any)?.Harga || 0;
      console.log(`📊 Tindakan: ${deskripsi} → Harga: ${harga}`);
      return sum + harga;
    }, 0);
    
    const historyTotal = billingHistory?.total_tarif_rs || 0;
    
    // Display: Tambahkan selected dengan history (untuk display card & form)
    // Jika ada history dan user pilih tindakan → history + selected
    // Jika tidak ada history dan user pilih tindakan → hanya selected
    // Jika belum pick tindakan → hanya history (preview)
    const displayTotal = selectedTindakan.length > 0 ? (historyTotal + selectedTotal) : historyTotal;
    
    console.log(`💰 Total Tarif RS Display: ${displayTotal} (History: ${historyTotal} + Selected: ${selectedTotal})`);
    setTotalTarifRS(displayTotal);
  }, [selectedTindakan, tarifRSList, billingHistory]);

  // Filter tindakan berdasarkan search
  const filteredTindakan = tarifRSList.filter((t) =>
    (t as any).Deskripsi?.toLowerCase().includes(tindakanSearch.toLowerCase()) ||
    (t as any).KodeRS?.toLowerCase().includes(tindakanSearch.toLowerCase())
  );

  // Remove tindakan - sekarang menggunakan Deskripsi
  const handleRemoveTindakan = (deskripsi: string) => {
    setSelectedTindakan(selectedTindakan.filter(t => t !== deskripsi));
  };

  // Add ICD9 - menyimpan Prosedur (bukan Kode_ICD9) karena backend mencari dengan Prosedur
  const handleAddICD9 = (kode: string) => {
    const icd = icd9List.find(i => (i as any).Kode_ICD9 === kode);
    if (icd && (icd as any).Prosedur && !selectedICD9.includes((icd as any).Prosedur)) {
      setSelectedICD9([...selectedICD9, (icd as any).Prosedur]);
      setIcd9Search('');
      setIcd9DropdownOpen(false);
    }
  };

  // Filter ICD9 berdasarkan search
  const filteredICD9 = icd9List.filter((icd) =>
    (icd as any).Prosedur?.toLowerCase().includes(icd9Search.toLowerCase()) ||
    (icd as any).Kode_ICD9?.toLowerCase().includes(icd9Search.toLowerCase())
  );

  // Remove ICD9 - sekarang menggunakan Prosedur
  const handleRemoveICD9 = (prosedur: string) => {
    setSelectedICD9(selectedICD9.filter(i => i !== prosedur));
  };

  // Add ICD10 - menyimpan Diagnosa (bukan Kode_ICD10) karena backend mencari dengan Diagnosa
  const handleAddICD10 = (kode: string) => {
    const icd = icd10List.find(i => (i as any).Kode_ICD10 === kode);
    if (icd && (icd as any).Diagnosa && !selectedICD10.includes((icd as any).Diagnosa)) {
      setSelectedICD10([...selectedICD10, (icd as any).Diagnosa]);
      setIcd10Search('');
      setIcd10DropdownOpen(false);
    }
  };

  // Filter ICD10 berdasarkan search
  const filteredICD10 = icd10List.filter((icd) =>
    (icd as any).Diagnosa?.toLowerCase().includes(icd10Search.toLowerCase()) ||
    (icd as any).Kode_ICD10?.toLowerCase().includes(icd10Search.toLowerCase())
  );

  // Handle select Ruangan
  const handleSelectRuangan = (idRuangan: string, namaRuangan: string) => {
    setRuangan(namaRuangan);
    setRuanganSearch(namaRuangan);
    setRuanganDropdownOpen(false);
  };

  // Filter Ruangan berdasarkan search
  const filteredRuangan = ruanganList.filter((r) =>
    (r as any).Nama_Ruangan?.toLowerCase().includes(ruanganSearch.toLowerCase()) ||
    (r as any).ID_Ruangan?.toString().toLowerCase().includes(ruanganSearch.toLowerCase())
  );

  // Handle select DPJP
  const handleSelectDPJP = (idDokter: string, namaDokter: string) => {
    setDpjp(idDokter);
    setDpjpSearch(namaDokter);
    setDpjpDropdownOpen(false);
  };

  // Filter DPJP berdasarkan search
  const filteredDPJP = dokterList.filter((d) =>
    (d as any).Nama_Dokter?.toLowerCase().includes(dpjpSearch.toLowerCase()) ||
    (d as any).ID_Dokter?.toString().toLowerCase().includes(dpjpSearch.toLowerCase())
  );

  // Remove duplicates based on Nama_Dokter (keep first occurrence)
  const uniqueDPJP = filteredDPJP.filter((d, index, self) =>
    index === self.findIndex((t) => (t as any).Nama_Dokter === (d as any).Nama_Dokter)
  );

  // Remove duplicates from full dokterList as well
  const uniqueDokterList = dokterList.filter((d, index, self) =>
    index === self.findIndex((t) => (t as any).Nama_Dokter === (d as any).Nama_Dokter)
  );

  // Remove ICD10 - sekarang menggunakan Diagnosa
  const handleRemoveICD10 = (diagnosa: string) => {
    setSelectedICD10(selectedICD10.filter(i => i !== diagnosa));
  };

  // Submit billing - HANYA INI YANG SAVE KE DATABASE
  // HANYA DIPANGGIL SAAT TOMBOL SAVE DIKLIK - TIDAK ADA AUTO SAVE
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Debug: Log untuk memastikan hanya dipanggil saat tombol Save diklik
    console.log('handleSubmit called - User clicked Save button');

    // Prevent multiple submissions
    if (isSubmitting || loading) {
      console.log('Submit blocked - already submitting');
      return;
    }

    setError('');
    setSuccess('');

    // Validation - Pastikan semua field wajib terisi
    if (!namaPasien || !usia || !ruangan || !kelas || !dpjp || !tanggalMasuk || !gender) {
      setError('Mohon lengkapi semua field yang wajib diisi');
      return;
    }

    // Check apakah pasien baru atau sudah ada (existing)
    const isPasienBaru = !billingHistory; // Jika billingHistory null, pasien baru

    if (selectedTindakan.length === 0) {
      setError('Mohon pilih minimal satu tindakan');
      return;
    }

    // Conditional validation untuk ICD10
    // Pasien baru: ICD10 WAJIB
    // Pasien existing: ICD10 OPTIONAL
    if (isPasienBaru && selectedICD10.length === 0) {
      setError('Mohon pilih minimal satu ICD10 (wajib untuk pasien baru)');
      return;
    }

    try {
      setIsSubmitting(true);
      setLoading(true);

      // Get dokter name from ID
      const selectedDokter = dokterList.find(d => (d as any).ID_Dokter.toString() === dpjp);
      if (!selectedDokter) {
        setError('Dokter tidak ditemukan');
        setLoading(false);
        return;
      }

      // Helper function untuk convert YYYY-MM-DD (dari date input) atau DD/MM/YYYY ke YYYY-MM-DD
      const convertDateFormat = (dateStr: string): string => {
        if (!dateStr) return '';
        // Check if format is already YYYY-MM-DD (from HTML5 date input)
        if (dateStr.includes('-') && dateStr.length === 10) {
          const parts = dateStr.split('-');
          if (parts.length === 3 && parts[0].length === 4) {
            // Already in YYYY-MM-DD format
            return dateStr;
          }
        }
        // If format is DD/MM/YYYY, convert to YYYY-MM-DD
        const parts = dateStr.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          return `${year}-${month}-${day}`;
        }
        // If cannot parse, return empty
        return '';
      };

        

      const totalKlaimBPJS = (billingHistory && billingHistory.total_klaim) ? billingHistory.total_klaim : 0;
      
      const billingData: BillingRequest = {
        nama_pasien: namaPasien,
        id_pasien: idPasien ? parseInt(idPasien) : undefined,
        jenis_kelamin: gender,
        usia: parseInt(usia),
        ruangan: ruangan,
        kelas: kelas,
        nama_dokter: [(selectedDokter as any).Nama_Dokter],
        tindakan_rs: selectedTindakan,
        // compute billing_sign dynamically using helper
        billing_sign: computeBillingSign(totalTarifRS, totalKlaimBPJS),
        tanggal_masuk: convertDateFormat(tanggalMasuk),
        tanggal_keluar: convertDateFormat(tanggalKeluar) || '',
        icd9: selectedICD9,
        icd10: selectedICD10,
        cara_bayar: caraBayar,
        // PENTING: Kirim totalTarifRS (final total = history + selected) agar backend tidak double
        total_tarif_rs: totalTarifRS,
        total_klaim_bpjs: totalKlaimBPJS, // ← Added: Send baseline BPJS claim to backend
      };

      console.log('📤 Sending billing data to backend:', {
        ...billingData,
        billing_sign: billingData.billing_sign,
        total_tarif_rs: billingData.total_tarif_rs,
        total_klaim_bpjs: billingData.total_klaim_bpjs,
        billingHistoryTotalKlaim: billingHistory?.total_klaim,
      });

      const response = await createBilling(billingData);

      if (response.error) {
        setError(response.error);
        setLoading(false);
        return;
      }

      if (response.data) {
        setSuccess('Billing berhasil dibuat!');

        // Simpan data ke localStorage untuk INACBG admin page
        const billingResponse = (response.data as any).data?.billing || {};
        const billingDataForINACBG = {
          id_billing: billingResponse.ID_Billing,
          nama_pasien: namaPasien,
          id_pasien: idPasien,
          usia: parseInt(usia),
          gender: gender,
          ruangan: ruangan,
          kelas: kelas,
          tindakan: selectedTindakan,
          icd9: selectedICD9,
          icd10: selectedICD10,
          total_tarif_rs: totalTarifRS,
          cara_bayar: caraBayar,
          tanggal_masuk: tanggalMasuk,
          tanggal_keluar: tanggalKeluar || null,
        };
        localStorage.setItem('currentBillingData', JSON.stringify(billingDataForINACBG));
        console.log('💾 Billing data saved to localStorage:', billingDataForINACBG);

        // Reset form setelah berhasil save
        setTimeout(() => {
          setNamaPasien('');
          setIdPasien('');
          setUsia('');
          setIdPasien('');
          setUsia('');
          setGender('Laki-Laki');
          setRuangan('');
          setRuanganSearch('');
          setKelas('');
          setTanggalMasuk('');
          setTanggalKeluar('');
          setDpjp('');
          setDpjpSearch('');
          setSelectedTindakan([]);
          setSelectedICD9([]);
          setSelectedICD10([]);
          setTotalTarifRS(0);
          setSearchResults([]);
          setSuccess('');
        }, 2000);
      }
    } catch (err) {
      setError('Gagal membuat billing. Pastikan backend server berjalan.');
      console.error(err);
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 bg-white w-full max-w-full">
      {/* Header dengan Tanggal */}
      <div className="mb-2 sm:mb-3">
        <div className="text-xs sm:text-sm text-[#2591D0]">
          {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Title */}
      <div className="text-lg sm:text-xl text-[#2591D0] mb-3 sm:mb-4 font-bold">Data Pasien</div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded-lg text-sm">
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="w-full"
        onKeyDown={(e) => {
          // Prevent form submission on Enter key unless it's the submit button
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') {
            e.preventDefault();
          }
        }}
      >
        {/* Data Pasien */}
        <div className="w-full max-w-full">
          {/* Nama Lengkap */}
          <div className="ml-0 sm:ml-4 text-sm sm:text-md text-[#2591D0] mb-2 sm:mb-3 font-bold">
            <p className="mb-2">Nama Lengkap</p>
            <div className="relative mb-3 sm:mb-4 flex gap-2">
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Masukkan nama lengkap"
                value={namaPasien}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={(e) => {
                  // Prevent form submission on Enter in input field
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                className="flex-1 border text-sm focus:outline-0 border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] focus:ring-2 focus:ring-blue-400"
              />
              <button
                type="button"
                onClick={handleSearchPasien}
                disabled={searchingPasien || !namaPasien.trim()}
                className="px-4 bg-[#2591D0] text-white rounded-full hover:bg-[#1e7ba8] disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <FaSearch />
              </button>
              {nameDropdownOpen && searchResults.length > 0 && (
                <div
                  ref={nameDropdownRef}
                  className="absolute top-full z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-[min(15rem,calc(100vh-12rem))] overflow-y-auto"
                  style={{ left: 0 }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {searchResults.map((p) => (
                    <div
                      key={p.ID_Pasien}
                      onClick={() => selectPasien(p)}
                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-[#2591D0]"
                    >
                      <div className="font-medium">{p.Nama_Pasien}</div>
                      <div className="text-xs text-gray-600">{p.Usia} tahun — {p.Ruangan}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Billing Sign Card (mirip INACBG) */}
            {totalTarifRS > 0 && totalKlaimBPJSLive > 0 && (
              <div className="ml-0 sm:ml-4 mt-4 mb-4 p-3 sm:p-4 rounded-lg border-2" style={{
                borderColor: liveBillingSign === 'Merah' ? '#dc2626' : liveBillingSign === 'Kuning' ? '#f59e0b' : '#10b981',
                backgroundColor: liveBillingSign === 'Merah' ? '#fee2e2' : liveBillingSign === 'Kuning' ? '#fef3c7' : '#ecfdf5'
              }}>
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="flex items-center justify-center h-6 w-6 sm:h-7 sm:w-7 rounded-full" style={{
                      backgroundColor: liveBillingSign === 'Merah' ? '#dc2626' : liveBillingSign === 'Kuning' ? '#f59e0b' : '#10b981'
                    }}>
                      <span className="text-white font-bold text-xs sm:text-sm">!</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm sm:text-base" style={{
                      color: liveBillingSign === 'Merah' ? '#7f1d1d' : liveBillingSign === 'Kuning' ? '#92400e' : '#065f46'
                    }}>
                      {liveBillingSign === 'Merah' ? '⚠️ Perhatian: Tarif RS Melebihi INACBG' :
                       liveBillingSign === 'Kuning' ? '⚠️ Perhatian: Tarif RS Mendekati INACBG' :
                       '✅ Tarif RS Dalam Batas Aman'}
                    </p>
                    <p className="text-xs sm:text-sm mt-1" style={{
                      color: liveBillingSign === 'Merah' ? '#991b1b' : liveBillingSign === 'Kuning' ? '#b45309' : '#047857'
                    }}>
                      Tarif RS: Rp {totalTarifRS.toLocaleString('id-ID')} | 
                      INACBG: Rp {totalKlaimBPJSLive.toLocaleString('id-ID')}
                    </p>
                    {liveBillingSign === 'Merah' && (
                      <p className="text-xs sm:text-sm mt-1" style={{
                        color: liveBillingSign === 'Merah' ? '#991b1b' : '#047857'
                      }}>
                        Selisih: Rp {(totalTarifRS - totalKlaimBPJSLive).toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {searchResults.length > 0 && (
              <div className="mb-2 text-xs text-gray-600">
                Ditemukan {searchResults.length} pasien. Data otomatis terisi.
              </div>
            )}
          </div>

          {/* Usia, Jenis kelamin */}
          <div className="ml-0 sm:ml-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-x-6 sm:gap-y-6 w-full max-w-full">
            {/* Usia */}
            <div>
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">Usia</label>
              <input
                type="number"
                placeholder="Masukkan usia"
                value={usia}
                onChange={(e) => setUsia(e.target.value)}
                onKeyDown={(e) => {
                  // Prevent form submission on Enter
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                required
              />
            </div>

            {/* Jenis Kelamin */}
            <div>
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">Jenis Kelamin</label>
              <div className="flex items-center space-x-3 sm:space-x-4 h-9 sm:h-10">
                <div className="flex items-center">
                  <input
                    id="radio-pria"
                    type="radio"
                    value="Laki-Laki"
                    name="jenis_kelamin"
                    checked={gender === 'Laki-Laki'}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-5 h-5 text-care-blue bg-gray-100 border-gray-300 accent-[#2591D0]"
                  />
                  <label htmlFor="radio-pria" className="ml-1.5 text-xs sm:text-sm font-medium text-[#2591D0]">Pria</label>
                </div>

                <div className="flex items-center">
                  <input
                    id="radio-wanita"
                    type="radio"
                    value="Perempuan"
                    checked={gender === 'Perempuan'}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-5 h-5 text-care-blue bg-gray-100 border-gray-300 accent-[#2591D0]"
                  />
                  <label htmlFor="radio-wanita" className="ml-1.5 text-xs sm:text-sm font-medium text-[#2591D0]">Wanita</label>
                </div>
              </div>
            </div>
          </div>

          {/* Ruang, Kelas */}
          <div className="ml-0 sm:ml-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-x-6 md:gap-x-12 sm:gap-y-6 w-full max-w-full">
            {/* Ruang */}
            <div className="relative">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">Ruang</label>
              <div className="relative">
                <input
                  ref={ruanganInputRef}
                  type="text"
                  placeholder="Cari ruang..."
                  value={ruanganSearch}
                  onChange={(e) => {
                    setRuanganSearch(e.target.value);
                    setRuanganDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (!ruanganJustClosed) {
                      setRuanganDropdownOpen(true);
                    }
                    setRuanganJustClosed(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredRuangan.length > 0) {
                      handleSelectRuangan((filteredRuangan[0] as any).ID_Ruangan.toString(), (filteredRuangan[0] as any).Nama_Ruangan);
                      e.preventDefault();
                    }
                  }}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  required
                />
                <FaChevronDown
                  onClick={(e) => {
                    e.stopPropagation();
                    if (ruanganDropdownOpen) {
                      setRuanganJustClosed(true);
                      setRuanganDropdownOpen(false);
                    } else {
                      setRuanganJustClosed(false);
                      setRuanganDropdownOpen(true);
                    }
                  }}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
                />
                {ruanganDropdownOpen && (
                  <div
                    ref={ruanganDropdownRef}
                    className="absolute z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {(ruanganSearch ? filteredRuangan : ruanganList).map((r) => (
                      <div
                        key={(r as any).ID_Ruangan}
                        onClick={() => handleSelectRuangan((r as any).ID_Ruangan.toString(), (r as any).Nama_Ruangan)}
                        className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-[#2591D0]"
                      >
                        <div className="font-medium">{(r as any).Nama_Ruangan}</div>
                      </div>
                    ))}
                    {ruanganSearch && filteredRuangan.length === 0 && (
                      <div className="px-4 py-2 text-sm text-gray-500 text-center">
                        Tidak ada hasil ditemukan
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Kelas */}
            <div>
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">Kelas</label>
              <div className="relative">
                <select
                  value={kelas}
                  onChange={(e) => setKelas(e.target.value)}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  required
                >
                  <option value="" disabled>Pilih kelas</option>
                  <option value="1" className="text-gray-700">Kelas 1</option>
                  <option value="2" className="text-gray-700">Kelas 2</option>
                  <option value="3" className="text-gray-700">Kelas 3</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tanggal Masuk & Keluar */}
          <div className="ml-0 sm:ml-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-x-6 md:gap-x-12 sm:gap-y-6 w-full max-w-full">
            <div>
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                Tanggal Masuk
              </label>
              <div className="relative">
                <input
                  ref={dateMasukRef}
                  type="date"
                  onChange={(e) => setTanggalMasuk(e.target.value)}
                  value={tanggalMasuk}
                  className="relative w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:hidden"
                  required
                />
                <FaCalendarAlt
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dateMasukRef.current) {
                      dateMasukRef.current.type = "date";
                      dateMasukRef.current.showPicker?.();
                    }
                  }}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                Tanggal Keluar
              </label>
              <div className="relative">
                <input
                  ref={dateKeluarRef}
                  type="date"
                  onChange={(e) => setTanggalKeluar(e.target.value)}
                  value={tanggalKeluar}
                  className="relative w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:hidden"
                />
                <FaCalendarAlt
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dateKeluarRef.current) {
                      dateKeluarRef.current.type = "date";
                      dateKeluarRef.current.showPicker?.();
                    }
                  }}
                  className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
                />
              </div>
            </div>
          </div>

          {/* DPJP */}
          <div className="ml-0 sm:ml-4 mt-2 relative">
            <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">DPJP</label>
            <div className="relative">
              <input
                ref={dpjpInputRef}
                type="text"
                placeholder="Cari dokter..."
                value={dpjpSearch}
                onChange={(e) => {
                  setDpjpSearch(e.target.value);
                  setDpjpDropdownOpen(true);
                }}
                onFocus={() => {
                  if (!dpjpJustClosed) {
                    setDpjpDropdownOpen(true);
                  }
                  setDpjpJustClosed(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && uniqueDPJP.length > 0) {
                    handleSelectDPJP((uniqueDPJP[0] as any).ID_Dokter.toString(), (uniqueDPJP[0] as any).Nama_Dokter);
                    e.preventDefault();
                  }
                }}
                className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                required
              />
              <FaChevronDown
                onClick={(e) => {
                  e.stopPropagation();
                  if (dpjpDropdownOpen) {
                    setDpjpJustClosed(true);
                    setDpjpDropdownOpen(false);
                  } else {
                    setDpjpJustClosed(false);
                    setDpjpDropdownOpen(true);
                  }
                }}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
              />
              {dpjpDropdownOpen && (
                <div
                  ref={dpjpDropdownRef}
                  className="absolute z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {(dpjpSearch ? uniqueDPJP : uniqueDokterList).map((d) => (
                    <div
                      key={(d as any).ID_Dokter}
                      onClick={() => handleSelectDPJP((d as any).ID_Dokter.toString(), (d as any).Nama_Dokter)}
                      className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-[#2591D0]"
                    >
                      <div className="font-medium">{(d as any).Nama_Dokter}</div>
                    </div>
                  ))}
                  {dpjpSearch && uniqueDPJP.length === 0 && (
                    <div className="px-4 py-2 text-sm text-gray-500 text-center">
                      Tidak ada hasil ditemukan
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Baris 1: Tindakan dan Total Tarif RS - TERPISAH, TIDAK MENYATU */}
          <div className="ml-0 sm:ml-4 mt-2 flex flex-col gap-4 sm:gap-6 w-full max-w-full">
            {/* Tindakan dan Pemeriksaan Penunjang */}
            <div className="w-full max-w-full relative">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">Tindakan dan Pemeriksaan Penunjang</label>
              <div className="flex items-center gap-2 sm:gap-3 mb-2 w-full max-w-full relative">
                <div className="flex-1 relative">
                  <input
                    ref={tindakanInputRef}
                    type="text"
                    placeholder="Cari tindakan..."
                    value={tindakanSearch}
                    onChange={(e) => {
                      setTindakanSearch(e.target.value);
                      setTindakanDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (!tindakanJustClosed) {
                        setTindakanDropdownOpen(true);
                      }
                      setTindakanJustClosed(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredTindakan.length > 0) {
                        handleAddTindakan((filteredTindakan[0] as any).KodeRS);
                        e.preventDefault();
                      }
                    }}
                    className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  />
                  <FaChevronDown
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tindakanDropdownOpen) {
                        setTindakanJustClosed(true);
                        setTindakanDropdownOpen(false);
                      } else {
                        setTindakanJustClosed(false);
                        setTindakanDropdownOpen(true);
                      }
                    }}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
                  />
                  {tindakanDropdownOpen && (
                    <div
                      ref={tindakanDropdownRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-[min(20rem,calc(100vh-12rem))] overflow-y-auto"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {(tindakanSearch ? filteredTindakan : tarifRSList).map((t) => (
                        <div
                          key={(t as any).KodeRS}
                          onClick={() => handleAddTindakan((t as any).KodeRS)}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-[#2591D0]"
                        >
                          <div className="font-medium">{(t as any).KodeRS}</div>
                          <div className="text-xs text-gray-600">{(t as any).Deskripsi}</div>
                        </div>
                      ))}
                      {tindakanSearch && filteredTindakan.length === 0 && (
                        <div className="px-4 py-2 text-sm text-gray-500 text-center">
                          Tidak ada hasil ditemukan
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-[#2591D0] rounded-full flex items-center justify-center text-white hover:bg-[#1e7ba8] transition-colors flex-shrink-0"
                  onClick={() => {
                    if (filteredTindakan.length > 0) {
                      handleAddTindakan((filteredTindakan[0] as any).KodeRS);
                    }
                  }}
                >
                  <FaPlus className="text-xs sm:text-sm" />
                </button>
              </div>
              {/* Selected tindakan chips */}
              {selectedTindakan.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedTindakan.map((t) => {
                    const tarif = tarifRSList.find(tar => (tar as any).Deskripsi === t);
                    const harga = (tarif as any)?.Harga || 0;
                    return (
                      <div key={t} className="flex items-center bg-blue-50 border border-blue-200 text-[#2591D0] rounded-full px-3 py-1 text-sm">
                        <span className="mr-2">{t}</span>
                        <span className="text-xs text-gray-600 mr-2">Rp {harga.toLocaleString('id-ID')}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTindakan(t)}
                          className="text-red-500 hover:text-red-700 ml-1"
                          aria-label={`Hapus tindakan ${t}`}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Total Tarif RS */}
            <div className="w-full max-w-full">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">Total Tarif RS</label>
              <input
                type="text"
                value={totalTarifRS.toLocaleString('id-ID')}
                readOnly
                className="w-full max-w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-blue-50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
              />
            </div>
          </div>

          {/* Riwayat Billing Aktif (Tindakan & ICD Sebelumnya) */}
          <div className="ml-0 sm:ml-4 mt-4 sm:mt-6 mb-4 sm:mb-6 w-full max-w-full">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <label className="block text-sm sm:text-md text-[#2591D0] font-bold">Riwayat Tindakan & ICD (Billing Aktif)</label>
              {userRole === "admin" && billingHistory && billingHistory.billingId && (
                <button
                  onClick={() => {
                    if (onEditBilling) {
                      onEditBilling(billingHistory.billingId!, namaPasien);
                    }
                  }}
                  className="flex items-center gap-2 bg-blue-500 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-xs sm:text-sm"
                >
                  <span>✏️</span>
                  <span>Edit INACBG</span>
                </button>
              )}
            </div>
            <div className="text-xs sm:text-sm text-blue-600 mb-3">{billingHistoryInfo}</div>
            {billingHistory && (billingHistory.tindakan_rs.length > 0 || billingHistory.icd9.length > 0 || billingHistory.icd10.length > 0 || (billingHistory.inacbg && billingHistory.inacbg.length > 0)) && (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto border border-blue-200 rounded-lg">
                  <table className="w-full text-sm md:text-base border-collapse">
                    <thead>
                      <tr className="bg-blue-100 border-b border-blue-200">
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">Tanggal Masuk</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">Tanggal Keluar</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">Tindakan RS</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">ICD 9</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">ICD 10</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">INACBG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Math.max(billingHistory.tindakan_rs.length, billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg?.length || 0) > 0 ? (
                        Array.from({
                          length: Math.max(billingHistory.tindakan_rs.length, billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg?.length || 0)
                        }).map((_, idx) => (
                          <tr key={`history-row-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {billingHistory.tanggal_masuk
                                ? new Date(billingHistory.tanggal_masuk).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
                                : '-'}
                            </td>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {billingHistory.tanggal_keluar
                                ? new Date(billingHistory.tanggal_keluar).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
                                : '-'}
                            </td>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {billingHistory.tindakan_rs[idx] || '-'}
                            </td>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {billingHistory.icd9[idx] || '-'}
                            </td>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {billingHistory.icd10[idx] || '-'}
                            </td>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {billingHistory.inacbg?.[idx] || '-'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="border border-blue-200 p-4 text-center text-gray-500">
                            Tidak ada riwayat
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Mobile/Tablet Card View */}
                <div className="md:hidden space-y-3">
                  {Math.max(billingHistory.tindakan_rs.length, billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg?.length || 0) > 0 ? (
                    Array.from({
                      length: Math.max(billingHistory.tindakan_rs.length, billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg?.length || 0)
                    }).map((_, idx) => (
                      <div
                        key={`history-card-${idx}`}
                        className="bg-white border border-blue-200 rounded-lg shadow-sm p-3 sm:p-4 hover:shadow-md transition-shadow"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-col space-y-1">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              Tanggal Masuk
                            </span>
                            <span className="text-sm text-[#2591D0] break-words">
                              {billingHistory.tanggal_masuk
                                ? new Date(billingHistory.tanggal_masuk).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
                                : '-'}
                            </span>
                          </div>
                          <div className="flex flex-col space-y-1">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              Tanggal Keluar
                            </span>
                            <span className="text-sm text-[#2591D0] break-words">
                              {billingHistory.tanggal_keluar
                                ? new Date(billingHistory.tanggal_keluar).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' })
                                : '-'}
                            </span>
                          </div>
                          <div className="flex flex-col space-y-1">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              Tindakan RS
                            </span>
                            <span className="text-sm text-[#2591D0] break-words">
                              {billingHistory.tindakan_rs[idx] || '-'}
                            </span>
                          </div>
                          <div className="flex flex-col space-y-1">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              ICD 9
                            </span>
                            <span className="text-sm text-[#2591D0] break-words">
                              {billingHistory.icd9[idx] || '-'}
                            </span>
                          </div>
                          <div className="flex flex-col space-y-1">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              ICD 10
                            </span>
                            <span className="text-sm text-[#2591D0] break-words">
                              {billingHistory.icd10[idx] || '-'}
                            </span>
                          </div>
                          <div className="flex flex-col space-y-1 pt-2 border-t border-blue-100">
                            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                              INACBG
                            </span>
                            <span className="text-sm text-[#2591D0] break-words">
                              {billingHistory.inacbg?.[idx] || '-'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-gray-500 text-sm bg-white border border-blue-200 rounded-lg">
                      Tidak ada riwayat
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Baris 2: ICD 10 dan ICD 9 - BERSEBELAHAN, TERPISAH KIRI KANAN */}
          <div className="ml-0 sm:ml-4 mt-4 sm:mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-x-6 md:gap-x-12 sm:gap-y-6 w-full max-w-full">
            {/* ICD 10 */}
            <div className="w-full relative">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">ICD 10</label>
              <div className="flex items-center gap-2 sm:gap-3 mb-2 relative">
                <div className="flex-1 relative">
                  <input
                    ref={icd10InputRef}
                    type="text"
                    placeholder="Masukkan diagnosa atau klik untuk melihat semua"
                    value={icd10Search}
                    onChange={(e) => {
                      setIcd10Search(e.target.value);
                      setIcd10DropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (!icd10JustClosed) {
                        setIcd10DropdownOpen(true);
                      }
                      setIcd10JustClosed(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredICD10.length > 0) {
                        handleAddICD10((filteredICD10[0] as any).Kode_ICD10);
                        e.preventDefault();
                      }
                    }}
                    className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  />
                  <FaChevronDown
                    onClick={(e) => {
                      e.stopPropagation();
                      if (icd10DropdownOpen) {
                        setIcd10JustClosed(true);
                        setIcd10DropdownOpen(false);
                      } else {
                        setIcd10JustClosed(false);
                        setIcd10DropdownOpen(true);
                      }
                    }}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
                  />
                  {icd10DropdownOpen && (
                    <div
                      ref={icd10DropdownRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {(icd10Search ? filteredICD10 : icd10List).map((icd) => (
                        <div
                          key={(icd as any).Kode_ICD10}
                          onClick={() => handleAddICD10((icd as any).Kode_ICD10)}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-[#2591D0]"
                        >
                          <div className="font-medium">{(icd as any).Kode_ICD10}</div>
                          <div className="text-xs text-gray-600">{(icd as any).Diagnosa}</div>
                        </div>
                      ))}
                      {icd10Search && filteredICD10.length === 0 && (
                        <div className="px-4 py-2 text-sm text-gray-500 text-center">
                          Tidak ada hasil ditemukan
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-[#2591D0] rounded-full flex items-center justify-center text-white hover:bg-[#1e7ba8] transition-colors flex-shrink-0"
                  onClick={() => {
                    if (filteredICD10.length > 0) {
                      handleAddICD10((filteredICD10[0] as any).Kode_ICD10);
                    }
                  }}
                >
                  <FaPlus className="text-xs sm:text-sm" />
                </button>
              </div>
              {/* Selected ICD10 chips */}
              {selectedICD10.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedICD10.map((p) => (
                    <div key={p} className="flex items-center bg-blue-50 border border-blue-200 text-[#2591D0] rounded-full px-3 py-1 text-sm">
                      <span className="mr-2">{p}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveICD10(p)}
                        className="text-red-500 hover:text-red-700 ml-1"
                        aria-label={`Hapus ICD10 ${p}`}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ICD 9 */}
            <div className="w-full relative">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">ICD 9</label>
              <div className="flex items-center gap-2 sm:gap-3 mb-2 relative">
                <div className="flex-1 relative">
                  <input
                    ref={icd9InputRef}
                    type="text"
                    placeholder="Masukkan prosedur atau klik untuk melihat semua"
                    value={icd9Search}
                    onChange={(e) => {
                      setIcd9Search(e.target.value);
                      setIcd9DropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (!icd9JustClosed) {
                        setIcd9DropdownOpen(true);
                      }
                      setIcd9JustClosed(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredICD9.length > 0) {
                        handleAddICD9((filteredICD9[0] as any).Kode_ICD9);
                        e.preventDefault();
                      }
                    }}
                    className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  />
                  <FaChevronDown
                    onClick={(e) => {
                      e.stopPropagation();
                      if (icd9DropdownOpen) {
                        setIcd9JustClosed(true);
                        setIcd9DropdownOpen(false);
                      } else {
                        setIcd9JustClosed(false);
                        setIcd9DropdownOpen(true);
                      }
                    }}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
                  />
                  {icd9DropdownOpen && (
                    <div
                      ref={icd9DropdownRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {(icd9Search ? filteredICD9 : icd9List).map((icd) => (
                        <div
                          key={(icd as any).Kode_ICD9}
                          onClick={() => handleAddICD9((icd as any).Kode_ICD9)}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-[#2591D0]"
                        >
                          <div className="font-medium">{(icd as any).Kode_ICD9}</div>
                          <div className="text-xs text-gray-600">{(icd as any).Prosedur}</div>
                        </div>
                      ))}
                      {icd9Search && filteredICD9.length === 0 && (
                        <div className="px-4 py-2 text-sm text-gray-500 text-center">
                          Tidak ada hasil ditemukan
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className="w-7 h-7 sm:w-8 sm:h-8 bg-[#2591D0] rounded-full flex items-center justify-center text-white hover:bg-[#1e7ba8] transition-colors flex-shrink-0"
                  onClick={() => {
                    if (filteredICD9.length > 0) {
                      handleAddICD9((filteredICD9[0] as any).Kode_ICD9);
                    }
                  }}
                >
                  <FaPlus className="text-xs sm:text-sm" />
                </button>
              </div>
              {/* Selected ICD9 chips */}
              {selectedICD9.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedICD9.map((p) => (
                    <div key={p} className="flex items-center bg-blue-50 border border-blue-200 text-[#2591D0] rounded-full px-3 py-1 text-sm">
                      <span className="mr-2">{p}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveICD9(p)}
                        className="text-red-500 hover:text-red-700 ml-1"
                        aria-label={`Hapus ICD9 ${p}`}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cara Bayar - di bawah ICD 9 */}
            <div className="w-full">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">Cara Bayar</label>
              <div className="relative">
                <select
                  value={caraBayar}
                  onChange={(e) => setCaraBayar(e.target.value)}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  required
                >
                  <option value="BPJS">BPJS</option>
                  <option value="UMUM">UMUM</option>
                </select>
              </div>
            </div>

            {/* Save Button - di bawah ICD 10 */}
            <div className="w-full flex items-end">
              <button
                type="submit"
                disabled={loading}
                className="bg-[#2591D0] text-white px-6 sm:px-8 py-2 sm:py-3 rounded-full font-medium hover:bg-[#1e7ba8] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm sm:text-base w-full"
              >
                {loading ? 'Menyimpan...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default BillingPasien;
