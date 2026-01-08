"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { FaPlus, FaChevronDown, FaSignOutAlt, FaTrash, FaArrowLeft } from "react-icons/fa";
import { apiFetch } from '@/lib/api-helper';
import { useRouter } from "next/navigation";

// Static logo import
import logoImage from "../../../public/assets/LOGO_CAREIT.svg";

interface INACBGAdminRuanganProps {
  onLogout?: () => void;
  onBack?: () => void;
  billingId?: number;
  pasienData?: {
    nama: string;
    idPasien: string;
    kelas: string;
    tindakan: string;
    totalTarifRS: number;
    icd9: string[];
    icd10: string[];
  };
}

interface TarifBPJSRawatInap {
  KodeINA: string;
  Deskripsi: string;
  Kelas1: number;
  Kelas2: number;
  Kelas3: number;
}

interface TarifBPJSRawatJalan {
  KodeINA: string;
  Deskripsi: string;
  TarifINACBG: number;
  tarif_inacbg?: number;
}

interface PostINACBGRequest {
  id_billing: number;
  tipe_inacbg: string;
  kode_inacbg: string[];
  total_klaim: number;
  billing_sign: string;
  tanggal_keluar: string;
}

const INACBG_Admin_Ruangan = ({
  onLogout,
  onBack,
  billingId,
  pasienData,
}: INACBGAdminRuanganProps) => {
  const router = useRouter();
  const [activeRuangan, setActiveRuangan] = useState("Ruangan 1");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Form state
  const [namaLengkap, setNamaLengkap] = useState("");
  const [idPasien, setIdPasien] = useState("");
  const [kelas, setKelas] = useState("");
  const [tindakan, setTindakan] = useState("");
  const [totalTarifRS, setTotalTarifRS] = useState(0);
  const [icd9, setIcd9] = useState("");
  const [icd10, setIcd10] = useState("");
  const [tanggalKeluar, setTanggalKeluar] = useState("");
  const [selectedInacbgCodes, setSelectedInacbgCodes] = useState<string[]>([]);
  // Kode yang sudah tersimpan sebelumnya di DB (baseline), dipakai agar total klaim tidak double-count
  const [existingInacbgCodes, setExistingInacbgCodes] = useState<string[]>([]);
  const [totalKlaimBPJS, setTotalKlaimBPJS] = useState(0);
  const [totalKlaimOriginal, setTotalKlaimOriginal] = useState<number>(0); // Original from database
  const [tipeInacbg, setTipeInacbg] = useState<"RI" | "RJ">("RI");
  // Live indicator should not default to Hijau/Merah before we have enough data to compute it.
  const [liveBillingSign, setLiveBillingSign] = useState<string>("");

  // Dropdown state
  const [inacbgRIData, setInacbgRIData] = useState<TarifBPJSRawatInap[]>([]);
  const [inacbgRJData, setInacbgRJData] = useState<TarifBPJSRawatJalan[]>([]);
  const [inacbgDropdownOpen, setInacbgDropdownOpen] = useState(false);
  const [inacbgJustClosed, setInacbgJustClosed] = useState(false);
  const [selectedInacbgCode, setSelectedInacbgCode] = useState("");
  const [inacbgSearch, setInacbgSearch] = useState("");

  // Billing history state (untuk menampilkan riwayat ICD9, ICD10, dan INACBG)
  const [billingHistory, setBillingHistory] = useState<{
    icd9: string[];
    icd10: string[];
    inacbg: string[];
    tanggal_masuk?: string | null;
    tanggal_keluar?: string | null;
  } | null>(null);
  const [billingHistoryInfo, setBillingHistoryInfo] = useState('Belum ada data yang dimuat.');

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ruanganItems, setRuanganItems] = useState<string[]>([]);

  const inacbgDropdownRef = useRef<HTMLDivElement>(null);
  const inacbgInputRef = useRef<HTMLInputElement>(null);

  // Load data pasien dari props pertama kali, atau localStorage, atau API
  useEffect(() => {
    const loadPatientData = async () => {
      try {
        // PRIORITY 1: Use pasienData dari props (dikirim oleh parent)
        if (pasienData) {
          console.log('📦 Patient data from props:', pasienData);
          setNamaLengkap(pasienData.nama || "");
          setIdPasien(pasienData.idPasien || "");
          setKelas(pasienData.kelas || "");
          setTotalTarifRS(pasienData.totalTarifRS || 0);
          setTindakan(Array.isArray(pasienData.tindakan) ? pasienData.tindakan.join(', ') : (pasienData.tindakan || ""));
          setIcd9(Array.isArray(pasienData.icd9) ? pasienData.icd9.join(', ') : (pasienData.icd9 || ""));
          setIcd10(Array.isArray(pasienData.icd10) ? pasienData.icd10.join(', ') : (pasienData.icd10 || ""));

          // Save to localStorage for future reference
          const billingData = {
            nama_pasien: pasienData.nama,
            id_pasien: pasienData.idPasien,
            kelas: pasienData.kelas,
            tindakan: Array.isArray(pasienData.tindakan) ? pasienData.tindakan : (pasienData.tindakan ? [pasienData.tindakan] : []),
            total_tarif_rs: pasienData.totalTarifRS,
            icd9: Array.isArray(pasienData.icd9) ? pasienData.icd9 : (pasienData.icd9 ? [pasienData.icd9] : []),
            icd10: Array.isArray(pasienData.icd10) ? pasienData.icd10 : (pasienData.icd10 ? [pasienData.icd10] : []),
          };
          localStorage.setItem('currentBillingData', JSON.stringify(billingData));
          console.log('💾 Patient data saved to localStorage from props');
          
          // Fetch billing data dari API untuk get tanggal_keluar dan verify total_tarif_rs (yang mungkin sudah terupdate)
          if (billingId) {
            try {
              const response = await apiFetch<any>(`/admin/billing/${billingId}`);
              if (!response.error && response.data) {
                const tanggalKeluarData = response.data.tanggal_keluar || response.data.Tanggal_keluar || "";
                setTanggalKeluar(tanggalKeluarData);
                console.log('📥 Tanggal keluar from API:', tanggalKeluarData);
                
                // IMPORTANT: Update totalTarifRS dari API (bisa sudah terupdate jika ada tindakan baru)
                const apiTarifRS = response.data.total_tarif_rs || 0;
                if (apiTarifRS > 0) {
                  setTotalTarifRS(apiTarifRS);
                  console.log(`📊 Updated Total_Tarif_RS from API: ${apiTarifRS} (was ${pasienData?.totalTarifRS})`);
                }
              }
            } catch (err) {
              console.error('Failed to fetch tanggal_keluar:', err);
            }
          }
          return;
        }

        // PRIORITY 2: Try to load from localStorage
        const storedData = localStorage.getItem('currentBillingData');
        if (storedData) {
          const billingData = JSON.parse(storedData);
          console.log('📦 Patient data loaded from localStorage:', billingData);

          setNamaLengkap(billingData.nama_pasien || "");
          setIdPasien(billingData.id_pasien || "");
          setKelas(billingData.kelas || "");
          setTotalTarifRS(billingData.total_tarif_rs || 0);

          if (billingData.tindakan && Array.isArray(billingData.tindakan) && billingData.tindakan.length > 0) {
            setTindakan(billingData.tindakan.join(', '));
          }

          if (billingData.icd9 && Array.isArray(billingData.icd9) && billingData.icd9.length > 0) {
            setIcd9(billingData.icd9.join(', '));
          }

          if (billingData.icd10 && Array.isArray(billingData.icd10) && billingData.icd10.length > 0) {
            setIcd10(billingData.icd10.join(', '));
          }
          
          // Fetch billing data dari API untuk get tanggal_keluar dan verify total_tarif_rs (yang mungkin sudah terupdate)
          if (billingId) {
            try {
              const response = await apiFetch<any>(`/admin/billing/${billingId}`);
              if (!response.error && response.data) {
                const tanggalKeluarData = response.data.tanggal_keluar || response.data.Tanggal_keluar || "";
                setTanggalKeluar(tanggalKeluarData);
                console.log('📥 Tanggal keluar from API:', tanggalKeluarData);
                
                // IMPORTANT: Update totalTarifRS dari API (bisa sudah terupdate jika ada tindakan baru)
                const apiTarifRS = response.data.total_tarif_rs || 0;
                if (apiTarifRS > 0) {
                  setTotalTarifRS(apiTarifRS);
                  console.log(`📊 Updated Total_Tarif_RS from API: ${apiTarifRS} (was ${billingData.total_tarif_rs})`);
                }
              }
            } catch (err) {
              console.error('Failed to fetch tanggal_keluar:', err);
            }
          }
          return;
        }

        // PRIORITY 3: If no localStorage data, fetch from API using billingId
        if (billingId) {
          console.log('📡 Fetching patient data from API with billingId:', billingId);
          try {
            const response = await apiFetch<any>(`/admin/billing/${billingId}`);
            if (!response.error && response.data) {
              const data = response.data;
              console.log('📥 Billing data from API:', data);

              setNamaLengkap(data.nama_pasien || data.patient_name || "");
              setIdPasien(data.id_pasien || data.patient_id || "");
              setKelas(data.kelas || "");
              setTotalTarifRS(data.total_tarif_rs || 0);

              if (data.tindakan) {
                if (Array.isArray(data.tindakan)) {
                  setTindakan(data.tindakan.join(', '));
                } else {
                  setTindakan(data.tindakan);
                }
              }

              if (data.icd9) {
                if (Array.isArray(data.icd9)) {
                  setIcd9(data.icd9.join(', '));
                } else {
                  setIcd9(data.icd9);
                }
              }

              if (data.icd10) {
                if (Array.isArray(data.icd10)) {
                  setIcd10(data.icd10.join(', '));
                } else {
                  setIcd10(data.icd10);
                }
              }

              // Extract tanggal_keluar dari response
              const tanggalKeluarData = data.tanggal_keluar || data.Tanggal_keluar || "";
              setTanggalKeluar(tanggalKeluarData);
              console.log('📥 Tanggal keluar from API:', tanggalKeluarData);

              // Store to localStorage
              localStorage.setItem('currentBillingData', JSON.stringify(data));
              console.log('💾 Patient data saved to localStorage from API');
            } else {
              console.error('Failed to fetch billing data');
            }
          } catch (err) {
            console.error('❌ Error fetching patient data from API:', err);
          }
        }
      } catch (err) {
        console.error('❌ Error loading patient data:', err);
      }
    };

    loadPatientData();
  }, [billingId, pasienData]);

  // Re-calculate totalKlaimBPJS saat selected codes atau INACBG data berubah
  // Single source of truth untuk perhitungan total klaim (menghindari konflik dengan manual add/remove)
  useEffect(() => {
    // Pastikan data INACBG sudah dimuat
    if (inacbgRIData.length === 0 && inacbgRJData.length === 0) {
      return; // Tunggu data dimuat dulu
    }

    // Base klaim = yang sudah ada di DB (kalau belum ada, base = 0)
    const baseKlaim = totalKlaimOriginal || 0;

    // Untuk case "tambah INACBG baru": tampilkan base + tarif kode yang BARU (yang belum ada di DB)
    const newCodes = selectedInacbgCodes.filter((c) => !existingInacbgCodes.includes(c));

    let tambahanKlaim = 0;

    // Extract class number from kelas string ("Kelas 1" -> 1, "Kelas 3" -> 3)
    const kelasMatch = kelas.match(/(\d+)/);
    const kelasNumber = kelasMatch ? parseInt(kelasMatch[1]) : 1;

    newCodes.forEach((code) => {
      let tarif = 0;
      if (tipeInacbg === 'RI') {
        const riItem = inacbgRIData.find((item) => item.KodeINA === code);
        // Select tarif based on kelas yang benar
        if (riItem) {
          if (kelasNumber === 1) tarif = riItem.Kelas1 || 0;
          else if (kelasNumber === 2) tarif = riItem.Kelas2 || 0;
          else if (kelasNumber === 3) tarif = riItem.Kelas3 || 0;
        }
      } else {
        const rjItem = inacbgRJData.find((item) => item.KodeINA === code);
        tarif = rjItem?.TarifINACBG || rjItem?.tarif_inacbg || 0;
      }
      // Potong 25% per item (klaim efektif)
      tambahanKlaim += tarif * 0.75;
    });

    const finalTotal = baseKlaim + tambahanKlaim;
    setTotalKlaimBPJS(finalTotal);

    console.log(
      `💰 Total Klaim Efektif(base + new): base = ${baseKlaim}, tambahan = ${tambahanKlaim}, total = ${finalTotal} (newCodes = ${newCodes.length}, selected = ${selectedInacbgCodes.length})`
    );
  }, [
    selectedInacbgCodes,
    existingInacbgCodes,
    inacbgRIData,
    inacbgRJData,
    tipeInacbg,
    kelas,
    totalKlaimOriginal,
  ]);

  // LIVE Billing Sign Calculation
  // Dipisah dari useEffect di atas agar tetap berjalan meskipun selectedInacbgCodes kosong (misal saat load dari DB)
  useEffect(() => {
    // Guard: only compute when we actually have numbers to compare
    if (!totalTarifRS || totalTarifRS <= 0 || !totalKlaimBPJS || totalKlaimBPJS <= 0) {
      if (liveBillingSign !== "") setLiveBillingSign("");
      return;
    }

    const sign = calculateBillingSign(totalTarifRS, totalKlaimBPJS);
    if (sign !== liveBillingSign) {
      setLiveBillingSign(sign);
      console.log(`🎨 Live Billing Sign updated to: ${sign} (Tarif: ${totalTarifRS}, Klaim: ${totalKlaimBPJS})`);
    }
  }, [totalTarifRS, totalKlaimBPJS, liveBillingSign]);

  // Load ruangan dengan pasien dan INACBG data, juga billing original data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch ruangan yang punya pasien
        const ruanganRes = await apiFetch<any[]>("/admin/ruangan-dengan-pasien");
        const ruanganData = ruanganRes.data || [];

        if (ruanganData && Array.isArray(ruanganData)) {
          const namaRuangan = ruanganData.map((r: any) => r.Nama_Ruangan || r.nama_ruangan);
          setRuanganItems(namaRuangan.length > 0 ? namaRuangan : ["Tidak ada ruangan"]);
          if (namaRuangan.length > 0) {
            setActiveRuangan(namaRuangan[0]);
          }
        }

        // Fetch INACBG data
        const [riResponse, rjResponse] = await Promise.all([
          apiFetch<TarifBPJSRawatInap[]>("/tarifBPJSRawatInap"),
          apiFetch<TarifBPJSRawatJalan[]>("/tarifBPJSRawatJalan"),
        ]);

        if (riResponse.data) {
          setInacbgRIData(riResponse.data);
        }
        if (rjResponse.data) {
          setInacbgRJData(rjResponse.data);
        }

        // Fetch billing detail untuk get Total_Klaim original dan billing aktif
        if (billingId) {
          try {
            // Fetch billing detail
            const res = await apiFetch<any>(`/admin/billing/${billingId}`);
            if (!res.error && res.data) {
              const data = res.data;
              console.log("📊 Billing data from API:", data);

              if (data.total_klaim) {
                setTotalKlaimOriginal(data.total_klaim);
                // Set totalKlaimBPJS juga supaya muncul di input
                setTotalKlaimBPJS(data.total_klaim);
                console.log(`💰 Set totalKlaimOriginal & totalKlaimBPJS: ${data.total_klaim} `);
              }

              // Load Tipe INACBG
              if (data.tipe_inacbg) {
                setTipeInacbg(data.tipe_inacbg as "RI" | "RJ");
                console.log(`🏥 Set tipeInacbg: ${data.tipe_inacbg} `);
              }

              // Jika DB belum punya kode_inacbg tapi sudah punya total_klaim,
              // jadikan baseline total_klaim sebagai base (existing codes dianggap kosong)
              if ((!data.kode_inacbg || (Array.isArray(data.kode_inacbg) && data.kode_inacbg.length === 0)) && data.total_klaim) {
                setExistingInacbgCodes([]);
              }

              // Load Saved INACBG Codes
              let loadedCodes: string[] = [];
              if (data.kode_inacbg) {
                if (Array.isArray(data.kode_inacbg)) {
                  loadedCodes = data.kode_inacbg;
                } else if (typeof data.kode_inacbg === 'string') {
                  // Handle stored as string/JSON
                  try {
                    // Try parsing as JSON array
                    const parsed = JSON.parse(data.kode_inacbg);
                    if (Array.isArray(parsed)) loadedCodes = parsed;
                    else loadedCodes = [data.kode_inacbg];
                  } catch (e) {
                    // Split by comma if not JSON
                    loadedCodes = data.kode_inacbg.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '');
                  }
                }

                if (loadedCodes.length > 0) {
                  // baseline codes (sudah ada di DB) untuk perhitungan base + new
                  setExistingInacbgCodes(loadedCodes);
                  setSelectedInacbgCodes(loadedCodes);
                  console.log(`📝 Loaded selectedInacbgCodes: `, loadedCodes);
                }
              }
            }

          } catch (err) {
            console.error("Error fetching billing data:", err);
            // Fallback: use totalKlaimBPJS yang terakumulasi
          }
        }
      } catch (err) {
        console.error("Error loading data:", err);
        setRuanganItems(["Gagal memuat ruangan"]);
      }
    };

    loadData();
  }, [billingId]);

  // Load billing aktif history saat namaLengkap tersedia
  useEffect(() => {
    if (namaLengkap && namaLengkap.trim() !== '') {
      loadBillingAktifHistory(namaLengkap);
    }
  }, [namaLengkap]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (inacbgDropdownOpen) {
        const isClickInsideInput = inacbgInputRef.current?.contains(target);
        const isClickInsideDropdown = inacbgDropdownRef.current?.contains(target);
        if (!isClickInsideInput && !isClickInsideDropdown) {
          setInacbgDropdownOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inacbgDropdownOpen]);

  // Get current date
  const getCurrentDate = () => {
    const days = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const months = [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ];
    const today = new Date();
    return `${days[today.getDay()]}, ${today.getDate()} ${months[today.getMonth()]
      } ${today.getFullYear()} `;
  };

  // Load billing aktif history untuk ditampilkan (ICD9, ICD10, INACBG)
  // Menggunakan endpoint yang sama dengan billing pasien untuk konsistensi
  const loadBillingAktifHistory = async (namaPasienParam: string) => {
    try {
      if (!namaPasienParam || namaPasienParam.trim() === '') {
        setBillingHistory({ icd9: [], icd10: [], inacbg: [] });
        setBillingHistoryInfo('Nama pasien tidak tersedia.');
        return;
      }

      const res = await apiFetch<{ data: any }>(
        `/billing/aktif?nama_pasien=${encodeURIComponent(namaPasienParam)}`
      );

      if (res.status === 404) {
        console.log('Tidak ada billing aktif untuk pasien ini');
        setBillingHistory({ icd9: [], icd10: [], inacbg: [] });
        setBillingHistoryInfo('Tidak ada riwayat billing aktif untuk pasien ini.');
        return;
      }

      if (res.error) {
        throw new Error(res.error);
      }

      const billingData = (res.data?.data || {}) as any;

      // UPDATE: Ambil total_klaim dari billing aktif jika ada dan belum ter-set
      if (billingData.billing && billingData.billing.total_klaim) {
        const klaimAktif = billingData.billing.total_klaim;
        console.log(`💰 Found total_klaim in active billing history: ${klaimAktif} `);

        if (totalKlaimOriginal === 0 || totalKlaimBPJS === 0) {
          setTotalKlaimOriginal(klaimAktif);
          setTotalKlaimBPJS(klaimAktif);
          console.log('✅ Updated totalKlaimBPJS from active billing history');
        }
      }

      // Ambil ICD9, ICD10, dan INACBG
      const icd9 = Array.isArray(billingData.icd9) ? billingData.icd9 : [];
      const icd10 = Array.isArray(billingData.icd10) ? billingData.icd10 : [];

      // Gabungkan INACBG RI dan RJ
      const inacbgRI = Array.isArray(billingData.inacbg_ri) ? billingData.inacbg_ri : [];
      const inacbgRJ = Array.isArray(billingData.inacbg_rj) ? billingData.inacbg_rj : [];
      const inacbg = [...inacbgRI, ...inacbgRJ];

      // Extract tanggal masuk dan tanggal keluar
      const tanggalMasuk = billingData.billing?.Tanggal_masuk || billingData.billing?.tanggal_masuk || null;
      const tanggalKeluar = billingData.billing?.Tanggal_keluar || billingData.billing?.tanggal_keluar || null;

      console.log('📅 Extracted dates from billing history:', { tanggalMasuk, tanggalKeluar, billingObj: billingData.billing });

      // Selalu set billing history, meskipun semua array kosong (untuk menampilkan tabel kosong)
      setBillingHistory({ icd9, icd10, inacbg, tanggal_masuk: tanggalMasuk, tanggal_keluar: tanggalKeluar });

      if (icd9.length > 0 || icd10.length > 0 || inacbg.length > 0) {
        setBillingHistoryInfo('Riwayat billing aktif berhasil dimuat.');
      } else {
        setBillingHistoryInfo('Riwayat billing aktif ditemukan, tetapi belum ada data ICD9, ICD10, atau INACBG.');
      }

      console.log('Billing aktif history loaded:', { icd9, icd10, inacbg });
    } catch (err) {
      console.error('Error loading billing history:', err);
      setBillingHistory({ icd9: [], icd10: [], inacbg: [] });
      setBillingHistoryInfo('Error: Gagal memuat riwayat billing.');
    }
  };

  // Filter INACBG codes based on search
  const filteredInacbgCodes = () => {
    // Extract class number from kelas string (\"Kelas 1\" -> 1, \"Kelas 3\" -> 3)
    const kelasMatch = kelas.match(/(\d+)/);
    const kelasNumber = kelasMatch ? parseInt(kelasMatch[1]) : 1;

    const data =
      tipeInacbg === "RI"
        ? inacbgRIData.map((item) => {
          // Select tarif based on kelas
          let tarifValue = item.Kelas1;
          if (kelasNumber === 1) tarifValue = item.Kelas1;
          else if (kelasNumber === 2) tarifValue = item.Kelas2;
          else if (kelasNumber === 3) tarifValue = item.Kelas3;

          return {
            code: item.KodeINA,
            description: item.Deskripsi,
            tarif: tarifValue,
          };
        })
        : inacbgRJData.map((item) => ({
          code: item.KodeINA,
          description: item.Deskripsi,
          tarif: item.TarifINACBG || item.tarif_inacbg || 0,
        }));

    if (!inacbgSearch) return data;

    return data.filter(
      (item) =>
        item.code.toLowerCase().includes(inacbgSearch.toLowerCase()) ||
        item.description.toLowerCase().includes(inacbgSearch.toLowerCase())
    );
  };

  // Lookup tarif INACBG "mentah" (belum dipotong 25%) untuk ditampilkan di tabel riwayat.
  // RI: gunakan kelas (1/2/3), RJ: gunakan TarifINACBG.
  const getInacbgTarifRaw = (code: string): number | null => {
    if (!code) return null;

    const kelasMatch = kelas.match(/(\d+)/);
    const kelasNumber = kelasMatch ? parseInt(kelasMatch[1]) : 1;

    const riItem = inacbgRIData.find((item) => item.KodeINA === code);
    if (riItem) {
      if (kelasNumber === 1) return riItem.Kelas1 || 0;
      if (kelasNumber === 2) return riItem.Kelas2 || 0;
      if (kelasNumber === 3) return riItem.Kelas3 || 0;
      return riItem.Kelas1 || 0;
    }

    const rjItem = inacbgRJData.find((item) => item.KodeINA === code);
    if (rjItem) return rjItem.TarifINACBG || rjItem.tarif_inacbg || 0;

    return null;
  };

  // Add INACBG code - mirip dengan handleAddICD9/ICD10
  // Total klaim akan dihitung ulang otomatis oleh useEffect (single source of truth)
  const handleAddInacbg = (code?: string) => {
    const codeToAdd = code || selectedInacbgCode;

    if (!codeToAdd) {
      // Jika ada filtered codes, ambil yang pertama
      const filtered = filteredInacbgCodes();
      if (filtered.length > 0) {
        const firstCode = filtered[0].code;
        if (!selectedInacbgCodes.includes(firstCode)) {
          setSelectedInacbgCodes([...selectedInacbgCodes, firstCode]);
          setInacbgSearch("");
          setInacbgDropdownOpen(false);
          setError("");
        }
      } else {
        setError("Pilih kode INA CBG terlebih dahulu");
      }
      return;
    }

    if (selectedInacbgCodes.includes(codeToAdd)) {
      setError("Kode INA CBG sudah ditambahkan");
      return;
    }

    // Hanya update selectedInacbgCodes, totalKlaimBPJS akan dihitung ulang otomatis oleh useEffect
    setSelectedInacbgCodes([...selectedInacbgCodes, codeToAdd]);
    setInacbgSearch("");
    setInacbgDropdownOpen(false);
    setError(""); // Clear error on successful add
  };

  // Remove INACBG code
  // Total klaim akan dihitung ulang otomatis oleh useEffect (single source of truth)
  const handleRemoveInacbg = (code: string) => {
    // Hanya update selectedInacbgCodes, totalKlaimBPJS akan dihitung ulang otomatis oleh useEffect
    setSelectedInacbgCodes(selectedInacbgCodes.filter((c) => c !== code));
  };

  // Calculate billing sign based on percentage
  // Mapping to database ENUM('Hijau','Kuning','Merah')
  // Rumus (klaim efektif per item): tarif INACBG sudah dipotong 25% per item saat dihitung ke totalKlaimBPJS.
  // Jadi di sini kita membandingkan Tarif RS vs totalKlaimBPJS (yang sudah efektif), TANPA potong 25% lagi.
  const calculateBillingSign = (totalTarifRS: number, totalKlaimBPJS: number): string => {
    console.log(`🔍 calculateBillingSign called: totalTarifRS = ${totalTarifRS}, totalKlaimBPJS = ${totalKlaimBPJS} `);

    if (!totalKlaimBPJS || totalKlaimBPJS === 0) {
      console.warn("⚠️ totalKlaimBPJS is 0 or empty, returning ' '");
      return " ";
    }

    // Hitung persentase: (Total_Tarif_RS / Total_Klaim_BPJS_Efektif) × 100%
    const percentage = (totalTarifRS / totalKlaimBPJS) * 100;
    console.log(`📊 Percentage: ${percentage.toFixed(2)}% `);

    if (percentage <= 25) {
      console.log("✅ Returning: Hijau (<=25%)");
      return "Hijau"; // Tarif RS <=25% dari Klaim BPJS Efektif = AMAN
    } else if (percentage <= 50) {
      console.log("✅ Returning: Kuning (26-50%)");
      return "Kuning"; // 26%-50% = PERLU PERHATIAN
    } else {
      console.log("✅ Returning: Merah (>50%)");
      return "Merah"; // >50% = WASPADA
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!billingId) {
      setError("ID Billing tidak ditemukan");
      return;
    }

    // Check apakah ini input INACBG pertama kali atau update harian
    // Jika sudah pernah input INACBG sebelumnya (existingInacbgCodes ada atau totalKlaimOriginal > 0), 
    // maka INACBG menjadi OPTIONAL untuk update harian
    const isFirstTimeInacbg = existingInacbgCodes.length === 0 && (!totalKlaimOriginal || totalKlaimOriginal === 0);
    
    if (isFirstTimeInacbg && selectedInacbgCodes.length === 0) {
      setError("Minimal pilih satu kode INA CBG (wajib untuk input pertama kali)");
      return;
    }
    
    // Untuk update harian, INACBG OPTIONAL, tapi jika dipilih harus ada minimal 1
    // Jika tidak ada kode yang dipilih untuk update, tetap bisa lanjut (akan compare dengan INACBG sebelumnya)

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      // Calculate billing_sign based on tariff comparison (klaim efektif per item)
      // totalKlaimBPJS di UI sudah berupa base + tambahan (dengan potong 25% per item untuk tambahan)
      const totalTarifRSValue = totalTarifRS || 0;
      const totalKlaimFinal = totalKlaimBPJS || 0;

      console.log(`💰 Data for billing_sign calculation: `);
      console.log(`   - totalTarifRS: ${totalTarifRSValue} `);
      console.log(`   - totalKlaimOriginal from DB(baseline): ${totalKlaimOriginal} `);
      console.log(`   - totalKlaimBPJS(base + new, effective): ${totalKlaimBPJS} `);
      console.log(`   - Using for calculation: ${totalKlaimFinal} `);

      const billingSignColor = calculateBillingSign(totalTarifRSValue, totalKlaimFinal);

      console.log(`📋 Final billing_sign value: ${billingSignColor} `);

      // Backend menambahkan input.total_klaim ke Total_Klaim yang sudah ada.
      // Jadi kita kirim DELTA (tambahan klaim efektif) untuk kode yang baru ditambahkan.
      const deltaKlaim = Math.max(0, totalKlaimBPJS - (totalKlaimOriginal || 0));

      const payload: PostINACBGRequest = {
        id_billing: billingId,
        tipe_inacbg: tipeInacbg,
        kode_inacbg: selectedInacbgCodes,
        total_klaim: deltaKlaim,
        billing_sign: billingSignColor,
        tanggal_keluar: tanggalKeluar,
      };

      console.log("📤 Sending INACBG payload:", payload);
      console.log(`📤 INACBG billing_sign being sent: '${billingSignColor}' (empty=${billingSignColor === ''})`);

      // Simpan selected codes ke localStorage SEBELUM submit
      const currentBillingData = localStorage.getItem('currentBillingData');
      if (currentBillingData) {
        try {
          const billingData = JSON.parse(currentBillingData);
          billingData.selected_inacbg_codes = selectedInacbgCodes;
          billingData.total_klaim_bpjs = totalKlaimBPJS;
          billingData.tipe_inacbg = tipeInacbg;
          localStorage.setItem('currentBillingData', JSON.stringify(billingData));
          console.log('💾 Selected INACBG codes saved to localStorage');
        } catch (err) {
          console.error('❌ Error saving to localStorage:', err);
        }
      }

      const response = await apiFetch<{ status: string; message: string }>("/admin/inacbg", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      console.log("📥 Response from backend:", response);

      if (response.error) {
        setError(response.error);
        return;
      }

      setSuccess("Data INA CBG berhasil disimpan");
      setTimeout(() => {
        // Navigate back to dashboard using router to avoid white screen
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyimpan data"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userRole");
    localStorage.removeItem("token");
    localStorage.removeItem("dokter");
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F5FAFD]">
      {/* Hamburger Menu Button - Mobile Only */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-[#2591D0] text-white p-2 rounded-lg shadow-lg hover:bg-[#1e7ba8] transition-colors"
        aria-label="Toggle sidebar"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          {isSidebarOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <div
        className={`
          fixed top - 0 left - 0
w - 56 sm: w - 64 h - screen
bg - [#ECF6FB] rounded - r - 2xl sm: rounded - r - 3xl shadow - lg
transition - transform duration - 300 z - 50
overflow - y - auto

          ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
lg: translate - x - 0 lg:relative lg: rounded - r - none lg: rounded - l - 3xl
  `}
      >
        {/* Logo */}
        <div className="p-3 sm:p-5 flex justify-center border-b border-blue-100">
          <Image
            src={logoImage}
            alt="CARE-IT Logo"
            width={140}
            height={70}
            className="object-contain w-24 sm:w-32 md:w-36"
          />
        </div>

        {/* Navigation Menu */}
        <nav className="mt-4 sm:mt-6 space-y-1 px-2 sm:px-4">
          {ruanganItems.map((ruangan, index) => {
            const isActive = activeRuangan === ruangan;

            return (
              <button
                key={index}
                onClick={() => {
                  setActiveRuangan(ruangan);
                  setIsSidebarOpen(false);
                }}
                className={`
w - full flex items - center py - 2 sm: py - 3 px - 2 sm: px - 4
rounded - lg text - left transition - all
                  ${isActive
                    ? "bg-white text-[#2591D0] border-l-4 border-[#2591D0] font-medium"
                    : "text-gray-400 hover:bg-white hover:text-gray-600"
                  }
`}
              >
                <span className="text-xs sm:text-sm">{ruangan}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:ml-0">
        {/* Top Bar */}
        <div className="bg-white shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <button
            onClick={() => router.back()}
            className="flex items-center text-[#2591D0] hover:text-[#1e7ba8] transition-colors gap-2"
          >
            <FaArrowLeft className="w-5 h-5" />
            <span className="font-semibold hidden sm:inline">Kembali</span>
          </button>
          <div className="flex items-center gap-4">
            <div className="text-[#2591D0] font-semibold text-sm sm:text-base">
              {getCurrentDate()}
            </div>
            <button
              onClick={handleLogout}
              className="text-[#2591D0] hover:text-[#1e7ba8] transition-colors"
              aria-label="Logout"
            >
              <FaSignOutAlt className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-white w-full max-w-full">
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

          {/* Title */}
          <div className="text-lg sm:text-xl text-[#2591D0] mb-3 sm:mb-4 font-bold">Data Pasien</div>

          <div className="w-full max-w-full">
            {/* Nama Lengkap */}
            <div className="ml-0 sm:ml-4 mb-3 sm:mb-4">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                Nama Lengkap
              </label>
              <input
                type="text"
                value={namaLengkap}
                onChange={(e) => setNamaLengkap(e.target.value)}
                className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                readOnly
              />
            </div>

            {/* ID Pasien dan Kelas - Two Columns */}
            <div className="ml-0 sm:ml-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-3 md:gap-x-4 lg:gap-x-6 sm:gap-y-3 md:gap-y-4 w-full max-w-full">
              <div>
                <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                  ID Pasien
                </label>
                <input
                  type="text"
                  value={idPasien}
                  onChange={(e) => setIdPasien(e.target.value)}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                  Kelas
                </label>
                <input
                  type="text"
                  value={kelas}
                  onChange={(e) => setKelas(e.target.value)}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  readOnly
                />
              </div>
            </div>

            {/* Tindakan dan Pemeriksaan Penunjang & Total Tarif RS - Two Columns */}
            <div className="ml-0 sm:ml-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-3 md:gap-x-4 lg:gap-x-6 sm:gap-y-3 md:gap-y-4 w-full max-w-full">
              {/* Tindakan dan Pemeriksaan Penunjang */}
              <div>
                <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                  Tindakan dan Pemeriksaan Penunjang
                </label>
                <input
                  type="text"
                  value={tindakan}
                  onChange={(e) => setTindakan(e.target.value)}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  readOnly
                />
              </div>
              {/* Total Tarif RS */}
              <div>
                <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                  Total Tarif RS
                </label>
                <input
                  type="text"
                  value={totalTarifRS.toLocaleString('id-ID')}
                  readOnly
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-blue-50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                />
              </div>
            </div>

            {/* ICD 9 dan ICD 10 - Two Columns */}
            <div className="ml-0 sm:ml-4 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-x-3 md:gap-x-4 lg:gap-x-6 sm:gap-y-3 md:gap-y-4 w-full max-w-full">
              <div>
                <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                  ICD 9
                </label>
                <input
                  type="text"
                  value={icd9}
                  onChange={(e) => setIcd9(e.target.value)}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  readOnly
                />
              </div>
              <div>
                <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                  ICD 10
                </label>
                <input
                  type="text"
                  value={icd10}
                  onChange={(e) => setIcd10(e.target.value)}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  readOnly
                />
              </div>
            </div>

            {/* Tanggal Keluar */}
            <div className="ml-0 sm:ml-4 mt-2">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                Tanggal Keluar (Opsional)
              </label>
              <input
                type="date"
                value={tanggalKeluar}
                onChange={(e) => setTanggalKeluar(e.target.value)}
                className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
              />
            </div>

            {/* Riwayat Billing Aktif (ICD9, ICD10, INACBG) */}
            <div className="ml-0 sm:ml-4 mt-4 sm:mt-6 mb-4 sm:mb-6 w-full max-w-full">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-2 sm:mb-3 font-bold">Riwayat Billing Aktif (ICD9, ICD10, INACBG)</label>
              <div className="text-xs sm:text-sm text-blue-600 mb-3">{billingHistoryInfo}</div>

              {/* Desktop Table View */}
              {billingHistory && (
                <div className="hidden md:block overflow-x-auto border border-blue-200 rounded-lg">
                  <table className="w-full text-sm md:text-base border-collapse">
                    <thead>
                      <tr className="bg-blue-100 border-b border-blue-200">
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">Tanggal Masuk</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">Tanggal Keluar</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">ICD 9</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">ICD 10</th>
                        <th className="border border-blue-200 p-3 md:p-4 text-left font-semibold text-[#2591D0]">INACBG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Math.max(billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg.length) > 0 ? (
                        Array.from({
                          length: Math.max(billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg.length)
                        }).map((_, idx) => (
                          <tr key={`history - row - ${idx} `} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
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
                              {billingHistory.icd9[idx] || '-'}
                            </td>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {billingHistory.icd10[idx] || '-'}
                            </td>
                            <td className="border border-blue-200 p-3 md:p-4 text-[#2591D0] break-words">
                              {(() => {
                                const code = billingHistory.inacbg[idx] || '';
                                if (!code) return '-';
                                const tarif = getInacbgTarifRaw(code);
                                return tarif === null
                                  ? code
                                  : `${code} — Rp ${Number(tarif).toLocaleString('id-ID')} `;
                              })()}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="border border-blue-200 p-4 text-center text-gray-500">
                            Belum ada data
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Mobile/Tablet Card View */}
              {billingHistory && (
                <div className="md:hidden space-y-3">
                  {Math.max(billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg.length) > 0 ? (
                    Array.from({
                      length: Math.max(billingHistory.icd9.length, billingHistory.icd10.length, billingHistory.inacbg.length)
                    }).map((_, idx) => (
                      <div
                        key={`history - card - ${idx} `}
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
                              {(() => {
                                const code = billingHistory.inacbg[idx] || '';
                                if (!code) return '-';
                                const tarif = getInacbgTarifRaw(code);
                                return tarif === null
                                  ? code
                                  : `${code} — Rp ${Number(tarif).toLocaleString('id-ID')} `;
                              })()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-gray-500 text-sm bg-white border border-blue-200 rounded-lg">
                      Belum ada data
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Warning Billing Sign - Real-time Display */}
            {totalTarifRS > 0 && totalKlaimBPJS > 0 && (
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
                      INACBG: Rp {totalKlaimBPJS.toLocaleString('id-ID')}
                    </p>
                    {liveBillingSign === 'Merah' && (
                      <p className="text-xs sm:text-sm mt-1" style={{
                        color: liveBillingSign === 'Merah' ? '#991b1b' : '#047857'
                      }}>
                        Selisih: Rp {(totalTarifRS - totalKlaimBPJS).toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tipe INA CBG */}
            <div className="ml-0 sm:ml-4 mt-2 mb-3 sm:mb-4">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                Tipe INA CBG
              </label>
              <div className="relative">
                <select
                  value={tipeInacbg}
                  onChange={(e) => {
                    setTipeInacbg(e.target.value as "RI" | "RJ");
                    setSelectedInacbgCodes([]);
                    setTotalKlaimBPJS(0);
                  }}
                  className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-[#2591D0] focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0 appearance-none bg-white"
                >
                  <option value="RI">Rawat Inap (RI)</option>
                  <option value="RJ">Rawat Jalan (RJ)</option>
                </select>
                <FaChevronDown className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none text-sm sm:text-base" />
              </div>
            </div>

            {/* INA CBG */}
            <div className="ml-0 sm:ml-4 mt-2 mb-3 sm:mb-4">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                INA CBG
              </label>
              <div className="flex items-center gap-2 sm:gap-3 mb-2 relative">
                <div className="flex-1 relative">
                  <input
                    ref={inacbgInputRef}
                    type="text"
                    placeholder="Cari kode INA CBG..."
                    value={inacbgSearch}
                    onChange={(e) => {
                      setInacbgSearch(e.target.value);
                      setInacbgDropdownOpen(true);
                    }}
                    onFocus={() => {
                      if (!inacbgJustClosed) {
                        setInacbgDropdownOpen(true);
                      }
                      setInacbgJustClosed(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filteredInacbgCodes().length > 0) {
                        handleAddInacbg(filteredInacbgCodes()[0].code);
                        e.preventDefault();
                      }
                    }}
                    className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-10 sm:pr-12 text-[#2591D0] placeholder-blue-400 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
                  />
                  <FaChevronDown
                    onClick={(e) => {
                      e.stopPropagation();
                      if (inacbgDropdownOpen) {
                        setInacbgJustClosed(true);
                        setInacbgDropdownOpen(false);
                      } else {
                        setInacbgJustClosed(false);
                        setInacbgDropdownOpen(true);
                      }
                    }}
                    className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 cursor-pointer hover:text-blue-600 text-sm sm:text-base pointer-events-auto z-10"
                  />
                  {inacbgDropdownOpen && (
                    <div
                      ref={inacbgDropdownRef}
                      className="absolute z-50 w-full mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      {filteredInacbgCodes().map((item) => (
                        <div
                          key={item.code}
                          onClick={() => handleAddInacbg(item.code)}
                          className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm text-[#2591D0]"
                        >
                          <div className="font-medium">{item.code}</div>
                          <div className="text-xs text-gray-600">{item.description}</div>
                        </div>
                      ))}
                      {inacbgSearch && filteredInacbgCodes().length === 0 && (
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
                    if (filteredInacbgCodes().length > 0) {
                      handleAddInacbg(filteredInacbgCodes()[0].code);
                    }
                  }}
                >
                  <FaPlus className="text-xs sm:text-sm" />
                </button>
              </div>
              {/* Selected INACBG chips */}
              {selectedInacbgCodes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedInacbgCodes.map((code) => {
                    const tarif = getInacbgTarifRaw(code);
                    return (
                      <div key={code} className="flex items-center bg-blue-50 border border-blue-200 text-[#2591D0] rounded-full px-3 py-1 text-sm">
                        <span className="mr-2">
                          {code} {tarif !== null ? `- Rp ${Number(tarif).toLocaleString('id-ID')} ` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveInacbg(code)}
                          className="text-red-500 hover:text-red-700 ml-1"
                          aria-label={`Hapus INACBG ${code} `}
                        >
                          <FaTrash />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Total Klaim BPJS */}
            <div className="ml-0 sm:ml-4 mt-2 mb-3 sm:mb-4">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                Total Klaim BPJS
              </label>
              <input
                type="text"
                value={totalKlaimBPJS.toLocaleString('id-ID')}
                readOnly
                className="w-full border text-sm border-blue-200 rounded-full py-2 sm:py-3 pl-3 sm:pl-4 pr-8 sm:pr-10 text-[#2591D0] bg-blue-50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 focus:outline-0"
              />
            </div>

            {/* Billing Sign Indicator */}
            <div className="ml-0 sm:ml-4 mt-2 mb-3 sm:mb-4">
              <label className="block text-sm sm:text-md text-[#2591D0] mb-1 sm:mb-2 font-bold">
                Status Klaim (Live)
              </label>
              <div
                className={`w - full py - 3 px - 4 rounded - lg font - bold text - center border transition - colors ${liveBillingSign === ""
                  ? "bg-gray-50 text-gray-600 border-gray-200"
                  : liveBillingSign === "Hijau"
                    ? "bg-green-100 text-green-700 border-green-300"
                    : liveBillingSign === "Kuning"
                      ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                      : "bg-red-100 text-red-700 border-red-300"
                  } `}
              >
                {liveBillingSign === "" && "Belum bisa dihitung (isi data klaim & tarif dulu)"}
                {liveBillingSign === "Hijau" && "Hijau - AMAN (<= 25%)"}
                {liveBillingSign === "Kuning" && "Kuning - PERHATIAN (26% - 50%)"}
                {liveBillingSign === "Merah" && "Merah - WASPADA (> 50%)"}
              </div>
            </div>

            {/* Save Button */}
            <div className="ml-0 sm:ml-4 mt-4 sm:mt-6 mb-4 sm:mb-6 flex justify-center">
              <button
                onClick={handleSave}
                disabled={loading}
                className="bg-[#87CEEB] text-white px-6 sm:px-8 py-2 sm:py-3 rounded-full font-medium hover:bg-[#5BAFE2] disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm sm:text-base w-full sm:w-auto"
              >
                {loading ? "Menyimpan..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default INACBG_Admin_Ruangan;

