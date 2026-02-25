
'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminPage() {
    const [auth, setAuth] = useState(false);
    const [pin, setPin] = useState('');
    const [activeTab, setActiveTab] = useState('report');

    // Data
    const [workers, setWorkers] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [report, setReport] = useState(null);
    const [settings, setSettings] = useState({ restaurant_name: 'RESTAUTANTE DOS', restaurant_logo: '' });

    useEffect(() => {
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data.restaurant_name || data.restaurant_logo) {
                    setSettings(prev => ({ ...prev, ...data }));
                }
            })
            .catch(err => console.error('Error loading settings:', err));
    }, []);

    // Inputs & Filters
    const [newWorker, setNewWorker] = useState({ rut: '', name: '', company: '', cost_center: '', is_premium: false, is_plus: false });
    const [newCompany, setNewCompany] = useState({ name: '' });
    const [companyLogo, setCompanyLogo] = useState(null);
    const [workerFile, setWorkerFile] = useState(null);

    // Use local browser date for default filter instead of UTC
    const [filters, setFilters] = useState({
        date: (() => {
            const d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        })(),
        month: '',
        company: 'TODAS',
        startDate: '',
        endDate: ''
    });
    const [filterType, setFilterType] = useState('date');



    const [workerFilterCompany, setWorkerFilterCompany] = useState('TODAS');

    // Bulk Selection
    const [selectedWorkers, setSelectedWorkers] = useState(new Set());

    useEffect(() => {
        if (auth) {
            handleRefresh(); // Call the unified refresher
        }
    }, [auth]);

    // Data Fetchers
    const fetchWorkers = async () => {
        const res = await fetch('/api/workers');
        if (res.ok) setWorkers(await res.json());
    };

    const fetchCompanies = async () => {
        const res = await fetch('/api/companies');
        if (res.ok) setCompanies(await res.json());
    };

    const fetchReport = async () => {
        let qs = '';
        if (filterType === 'date') qs += `?date=${filters.date}`;
        else if (filterType === 'month') qs += `?month=${filters.month}`;
        else if (filterType === 'week') qs += `?mode=week`;
        else if (filterType === 'range') qs += `?mode=range&startDate=${filters.startDate}&endDate=${filters.endDate}`;
        else if (filterType === 'all') qs += `?mode=all`;

        if (filters.company !== 'TODAS') qs += `&company=${filters.company}`;

        const res = await fetch(`/api/report${qs}`);
        if (res.ok) setReport(await res.json());
    };

    // Unified Refresh
    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await Promise.all([fetchCompanies(), fetchWorkers(), fetchReport()]);
            setSelectedWorkers(new Set()); // Reset selection
            // Small delay to let user see the change if it is too fast
            await new Promise(resolve => setTimeout(resolve, 500));
            alert('Datos actualizados correctamente desde la base de datos.');
        } catch (e) {
            alert('Error al actualizar datos');
        } finally {
            setRefreshing(false);
        }
    };

    // Actions
    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ pin }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();

            if (data.success) {
                setAuth(true);
            } else {
                alert(data.error || 'Password Incorrecta');
            }
        } catch (err) {
            alert('Error de conexión');
        }
    };

    // ... (Worker & Company Actions same as before, simplified for brevity here but keeping core logic)
    const handleAddWorker = async (e) => {
        e.preventDefault();
        await fetch('/api/workers', {
            method: 'POST',
            body: JSON.stringify({ ...newWorker, company: newWorker.company || companies[0]?.name }),
            headers: { 'Content-Type': 'application/json' }
        });
        fetchWorkers();
        setNewWorker({ rut: '', name: '', company: '', cost_center: '', is_premium: false, is_plus: false });
        alert('Trabajador agregado');
    };

    const handleBulkUpload = async (e) => {
        e.preventDefault();
        if (!workerFile) return alert('Seleccione un archivo Excel');
        const fd = new FormData();
        fd.append('file', workerFile);
        const res = await fetch('/api/workers/upload', { method: 'POST', body: fd });
        const data = await res.json();
        alert(`Importados: ${data.imported}. Errores: ${data.errors}`);
        fetchWorkers();
    };

    const [companyPreview, setCompanyPreview] = useState(null);

    const handleAddCompany = async (e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('name', newCompany.name);
        if (newCompany.rut) fd.append('rut', newCompany.rut);
        if (newCompany.address) fd.append('address', newCompany.address);
        if (newCompany.contact_name) fd.append('contact_name', newCompany.contact_name);
        if (newCompany.contact_email) fd.append('contact_email', newCompany.contact_email);
        if (newCompany.contact_phone) fd.append('contact_phone', newCompany.contact_phone);

        if (newCompany.id) fd.append('id', newCompany.id);

        if (companyLogo) fd.append('logo', companyLogo);

        try {
            const res = await fetch('/api/companies', { method: 'POST', body: fd });
            const data = await res.json();

            if (res.ok) {
                fetchCompanies();
                setNewCompany({ name: '' });
                setCompanyLogo(null);
                setCompanyPreview(null);
                alert('Empresa guardada correctamente');
            } else {
                alert('Error: ' + (data.error || 'No se pudo guardar la empresa'));
            }
        } catch (error) {
            console.error(error);
            alert('Error de conexión al guardar empresa');
        }
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setCompanyLogo(file);
            setCompanyPreview(URL.createObjectURL(file));
        }
    };

    const handleDeleteWorker = async (id) => {
        if (!confirm('¿Eliminar?')) return;
        await fetch(`/api/workers?id=${id}`, { method: 'DELETE' });
        fetchWorkers();
    };

    // Bulk Delete Action
    const handleBulkDelete = async () => {
        const ids = Array.from(selectedWorkers);
        if (ids.length === 0) return;

        if (!confirm(`¿Eliminar ${ids.length} trabajadores seleccionados?`)) return;

        try {
            const res = await fetch(`/api/workers?id=${ids.join(',')}`, { method: 'DELETE' });
            if (res.ok) {
                alert('Trabajadores eliminados');
                handleRefresh();
            } else {
                alert('Error al eliminar');
            }
        } catch (e) {
            console.error(e);
            alert('Error de conexión');
        }
    };

    // Toggle Selection
    const toggleWorkerSelection = (id) => {
        const newSet = new Set(selectedWorkers);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedWorkers(newSet);
    };

    const handleDeleteCompany = async (id) => {
        if (!confirm('¿Eliminar empresa?')) return;
        await fetch(`/api/companies?id=${id}`, { method: 'DELETE' });
        fetchCompanies();
    };

    const togglePrintStatus = async (id, currentStatus) => {
        const newStatus = !currentStatus;

        // Optimistic Update
        if (report && report.orders) {
            setReport(prev => ({
                ...prev,
                orders: prev.orders.map(o => o.id === id ? { ...o, printed: newStatus } : o)
            }));
        }

        try {
            await fetch(`/api/order?id=${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ printed: newStatus }),
                headers: { 'Content-Type': 'application/json' }
            });
            fetchReport();
        } catch (e) {
            console.error("Error toggling print status", e);
        }
    };

    const handlePrintTicket = (id) => {
        window.open(`/ticket/${id}?print=true`, '_blank');
    };

    const handleDeleteOrder = async (id) => {
        if (!confirm('¿Eliminar este pedido permanentemente?')) return;

        try {
            const res = await fetch(`/api/order?id=${id}`, { method: 'DELETE' });
            const data = await res.json();

            if (res.ok) {
                fetchReport(); // Refresh list
            } else {
                alert(data.error || 'Error al eliminar');
            }
        } catch (e) {
            alert('Error de conexión');
        }
    };

    // EXPORTS
    const exportExcel = () => {
        if (!report) return;
        const wb = XLSX.utils.book_new();

        // Hoja Resumen
        const summaryData = [['Empresa', 'RUT', 'Dirección', 'Cantidad']];
        Object.entries(report.summary).forEach(([k, v]) => {
            if (k === 'TOTAL') return;
            const comp = companies.find(c => c.name === k);
            summaryData.push([k, comp?.rut || '', comp?.address || '', v]);
        });
        summaryData.push(['TOTAL', '', '', report.summary.TOTAL]);

        // Add Cost Center Summary to Excel
        if (report.ccSummary && Object.keys(report.ccSummary).length > 0) {
            summaryData.push([]); // Spacer
            summaryData.push(['RESUMEN POR CENTRO DE COSTO']);
            summaryData.push(['Centro de Costo', 'Cantidad']);

            Object.entries(report.ccSummary).forEach(([cc, qty]) => {
                summaryData.push([cc, qty]);
            });
        }

        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");

        // Hoja Detalle
        const detailData = report.orders.map(o => {
            const comp = companies.find(c => c.name === o.company);
            const workerData = workers.find(w => w.rut === o.worker_rut);

            // Fix Date Parsing
            const dateObj = new Date(o.created_at);
            const timeStr = !isNaN(dateObj) ? dateObj.toLocaleTimeString() : '-';

            // Signature URL
            // Using window.location.origin to get base URL
            const signatureUrl = o.signature ? `${window.location.origin}/api/signature?id=${o.id}` : 'No';
            const ticketUrl = `${window.location.origin}/ticket/${o.id}`;

            return {
                'Código Pedido': o.id,
                Fecha: o.date_str,
                Hora: timeStr,
                Nombre: o.worker_name,
                Empresa: o.company,
                'Centro de Costo': workerData?.cost_center || 'No Informado',
                'RUT Empresa': comp?.rut || '',
                'Dirección Empresa': comp?.address || '',
                'Tipo Entrega': o.type,
                'Tipo Colación': o.meal_type || 'ALMUERZO',
                Cantidad: o.quantity || 1,
                'Nombres Invitados': o.guest_names || '-',
                'Detalle / Notas': o.order_detail || '-',
                'Hora Retiro': o.pickup_time || '-',
                'Quien Retira': o.pickup_name || '-',
                'Impreso': o.printed ? 'SI' : 'NO',
                'Firma URL': signatureUrl,
                'Ticket URL': ticketUrl
            };
        });
        const wsDetail = XLSX.utils.json_to_sheet(detailData);
        XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle");

        XLSX.writeFile(wb, `Reporte_${settings.restaurant_name.replace(/\s+/g, '_')}_${(() => {
            const d = new Date();
            return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        })()}.xlsx`);
    };

    const exportPDF = () => {
        if (!report) return;
        // Landscape Letter (Carta) size: 279mm x 216mm
        const doc = new jsPDF('l', 'mm', 'letter');

        doc.setFontSize(18);
        doc.text(`Reporte de Colaciones - ${settings.restaurant_name}`, 14, 22);

        doc.setFontSize(11);
        doc.text(`Fecha Generación: ${new Date().toLocaleDateString()}`, 14, 30);

        // ... text filters logic ...
        if (filterType === 'date') doc.text(`Filtro: ${filters.date}`, 14, 36);
        else if (filterType === 'month') doc.text(`Filtro: ${filters.month}`, 14, 36);
        else if (filterType === 'week') doc.text(`Filtro: ÚLTIMOS 7 DÍAS`, 14, 36);
        else if (filterType === 'range') doc.text(`Filtro: ${filters.startDate} al ${filters.endDate}`, 14, 36);
        else doc.text(`Filtro: HISTÓRICO COMPLETO`, 14, 36);


        // Tabla Resumen
        const summaryBody = Object.entries(report.summary)
            .filter(([k]) => k !== 'TOTAL')
            .map(([k, v]) => {
                const comp = companies.find(c => c.name === k);
                return [k, comp?.rut || '-', comp?.address || '-', v];
            });

        summaryBody.push(['TOTAL', '', '', report.summary.TOTAL]);

        autoTable(doc, {
            startY: 45,
            head: [['Empresa', 'RUT', 'Dirección', 'Total']],
            body: summaryBody,
            theme: 'grid',
            headStyles: { fillColor: [139, 92, 246] } // Royal Purple
        });

        // Tabla Resumen Centros de Costo
        if (report.ccSummary && Object.keys(report.ccSummary).length > 0) {
            const ccBody = Object.entries(report.ccSummary).map(([k, v]) => [k, v]);

            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 10,
                head: [['Centro de Costo', 'Cantidad']],
                body: ccBody,
                theme: 'grid',
                headStyles: { fillColor: [71, 85, 105] }, // Slate-600
                columnStyles: {
                    0: { cellWidth: 100 },
                    1: { cellWidth: 30, halign: 'center' }
                }
            });
        }

        // Tabla Detalle
        const detailBody = report.orders.map(o => {
            const signatureUrl = o.signature ? `${window.location.origin}/api/signature?id=${o.id}` : null;
            const ticketUrl = `${window.location.origin}/ticket/${o.id}`;
            const timeStr = new Date(o.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

            return [
                o.id,
                o.date_str,
                timeStr,
                o.worker_name,
                o.company,
                o.type,
                o.meal_type || 'ALMUERZO',
                o.quantity || 1,
                o.guest_names || '-',
                o.order_detail || '-',
                o.pickup_time || '-', // Hora Retiro
                o.pickup_name || '-', // Quien Retira
                o.printed ? 'SI' : 'NO', // Impreso
                signatureUrl,
                ticketUrl
            ];
        });

        autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 15,
            // Header Names
            head: [['Cod.', 'Fecha', 'Hora', 'Nombre', 'Empresa', 'Entrega', 'Colación', 'Cant.', 'Invitados', 'Detalle / Notas', 'H. Ret.', 'Q. Ret.', 'Impreso', 'Firma', 'Ticket']],
            body: detailBody,
            theme: 'striped',
            // Table Styles
            styles: {
                fontSize: 7,
                cellPadding: 1,
                overflow: 'linebreak', // Ensure text wraps
                valign: 'middle'
            },
            headStyles: {
                fillColor: [30, 41, 59], // Dark Blue/Slate
                textColor: [255, 255, 255],
                fontSize: 7,
                fontStyle: 'bold',
                halign: 'center'
            },
            // Column Widths (Total ~250mm usable on Letter Landscape)
            columnStyles: {
                0: { cellWidth: 14 }, // Cod
                1: { cellWidth: 16 }, // Fecha (YYYY-MM-DD is fixed width)
                2: { cellWidth: 10 }, // Hora
                3: { cellWidth: 24 }, // Nombre (Reduced from 28)
                4: { cellWidth: 20 }, // Empresa (Reduced from 22)
                5: { cellWidth: 14 }, // Entrega
                6: { cellWidth: 16 }, // Colación
                7: { cellWidth: 8, halign: 'center' },  // Cant
                8: { cellWidth: 38 }, // Invitados (Increased from 32)
                9: { cellWidth: 35 }, // Detalle (Reduced from 43 to fit Ticket)
                10: { cellWidth: 12, halign: 'center' }, // H. Ret
                11: { cellWidth: 15 }, // Q. Ret (Reduced from 20)
                12: { cellWidth: 12, halign: 'center' }, // Impreso
                13: { cellWidth: 15, halign: 'center' }, // Firma (Reduced from 18)
                14: { cellWidth: 15, halign: 'center' }  // Ticket
            },
            didDrawCell: (data) => {
                if (data.section === 'body') {
                    if (data.column.index === 13) {
                        const signatureUrl = data.cell.raw;
                        if (signatureUrl && typeof signatureUrl === 'string' && signatureUrl.startsWith('http')) {
                            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: signatureUrl });
                        }
                    } else if (data.column.index === 14) {
                        const ticketUrl = data.cell.raw;
                        if (ticketUrl && typeof ticketUrl === 'string' && ticketUrl.startsWith('http')) {
                            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: ticketUrl });
                        }
                    }
                }
            },
            willDrawCell: (data) => {
                if (data.section === 'body') {
                    if (data.column.index === 13) {
                        const signatureUrl = data.cell.raw;
                        if (signatureUrl && typeof signatureUrl === 'string' && signatureUrl.startsWith('http')) {
                            data.cell.text = ['VER FIRMA'];
                            data.cell.styles.textColor = [37, 99, 235]; // Blue
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.cursor = 'pointer';
                            data.cell.styles.fontSize = 6;
                        } else {
                            data.cell.text = ['-'];
                        }
                    } else if (data.column.index === 14) {
                        const ticketUrl = data.cell.raw;
                        if (ticketUrl && typeof ticketUrl === 'string' && ticketUrl.startsWith('http')) {
                            data.cell.text = ['VER TICKET'];
                            data.cell.styles.textColor = [37, 99, 235]; // Blue
                            data.cell.styles.fontStyle = 'bold';
                            data.cell.styles.cursor = 'pointer';
                            data.cell.styles.fontSize = 6;
                        }
                    }
                }
            }
        });

        doc.save(`reporte_${settings.restaurant_name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
    };

    // Filtered Workers Logic
    const [searchTerm, setSearchTerm] = useState('');

    const filteredWorkers = workers.filter(w => {
        const matchesCompany = workerFilterCompany === 'TODAS' ? true : w.company === workerFilterCompany;
        const matchesSearch = w.name.toLowerCase().includes(searchTerm.toLowerCase()) || w.rut.includes(searchTerm);
        return matchesCompany && matchesSearch;
    });

    const viewWorkerConsumption = (rut) => {
        setFilters({ ...filters, company: 'TODAS' }); // Reset company to see all
        setFilterType('all'); // Set to history
        // Use a special internal state or just rely on API? 
        // Let's cheat a bit and add a 'worker_rut' to filters state ONLY for this purpose, 
        // though standard filters don't have it.
        // Actually, let's just trigger a fetch with a custom query manually or add it to state.
        // Adding to state is cleaner.
        // wait, 'filters' state object is fixed structure. Let's add 'worker' to it? No, simpler:
        // switch tab
        setActiveTab('report');
        // trigger fetch with special param
        fetchDataForWorker(rut);
    };

    const fetchDataForWorker = async (rut) => {
        const res = await fetch(`/api/report?mode=all&company=TODAS&worker_rut=${rut}`);
        if (res.ok) {
            setReport(await res.json());
            alert(`Mostrando historial para el trabajador: ${rut}`);
        }
    };

    if (!auth) return (
        <div className="container" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card">
                {settings.restaurant_logo && (
                    <img src={settings.restaurant_logo} alt="Logo" style={{ height: '60px', margin: '0 auto 1.5rem', display: 'block', borderRadius: '8px' }} />
                )}
                <h1 className="text-2xl font-bold mb-4 text-center">{settings.restaurant_name} Admin</h1>
                <form onSubmit={handleLogin}>
                    <input type="password" className="input" placeholder="PIN" value={pin} onChange={e => setPin(e.target.value)} />
                    <button className="btn">Ingresar</button>
                </form>
            </div>
        </div>
    );

    return (
        <div className="container" style={{ maxWidth: '98%', lineHeight: '1.6' }}>
            {/* ... Header ... */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 className="text-3xl text-primary font-bold tracking-wide">GESTIÓN DE COLACIONES</h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="btn"
                        style={{ fontSize: '1rem', padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <span className={refreshing ? "animate-spin" : ""}>🔄</span>
                        {refreshing ? 'Actualizando...' : 'Refrescar Datos'}
                    </button>

                    <a
                        href="https://www.automatizafix.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary font-bold text-xl hover:text-white transition-colors"
                        style={{ textDecoration: 'none' }}
                        title="Desarrollado por TotalFix"
                    >
                        TotalFix
                    </a>

                    <button onClick={() => setAuth(false)} className="btn-sm btn-outline text-danger" style={{ borderColor: 'currentColor' }}>Salir</button>
                </div>
            </header>

            <div style={{ marginBottom: '2rem', borderBottom: '1px solid #334155', paddingBottom: '1rem', display: 'flex', gap: '1rem', overflowX: 'auto' }}>
                {['report', 'workers', 'companies', 'settings_tab'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`btn-sm ${activeTab === tab ? 'btn' : 'btn-outline'}`}
                        style={{ textTransform: 'capitalize', fontSize: '1rem', padding: '0.5rem 1.5rem' }}
                    >
                        {tab === 'report' ? 'Reportes' : tab === 'workers' ? 'Trabajadores' : tab === 'companies' ? 'Empresas' : 'Ajustes'}
                    </button>
                ))}
            </div>

            {/* --- REPORTES --- */}
            {activeTab === 'report' && (
                <div>
                    <div className="card" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'end', marginBottom: '2rem' }}>
                        <div>
                            <label className="text-sm block mb-1 font-bold">Tipo Filtro</label>
                            <select className="select" style={{ width: 'auto', marginBottom: 0 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
                                <option value="date">Día Específico</option>
                                <option value="week">Últimos 7 Días</option>
                                <option value="month">Mes Completo</option>
                                <option value="range">Rango de Fechas</option>
                                <option value="all">Histórico Completo</option>
                            </select>
                        </div>
                        <div>
                            {filterType !== 'all' && filterType !== 'week' && filterType !== 'range' && (
                                <>
                                    <label className="text-sm block mb-1 font-bold">{filterType === 'date' ? 'Fecha' : 'Mes'}</label>
                                    <input
                                        type={filterType === 'date' ? 'date' : 'month'}
                                        className="input"
                                        style={{ width: 'auto', marginBottom: 0 }}
                                        value={filterType === 'date' ? filters.date : filters.month}
                                        onChange={e => setFilters({ ...filters, [filterType === 'date' ? 'date' : 'month']: e.target.value })}
                                    />
                                </>
                            )}
                            {filterType === 'range' && (
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <div>
                                        <label className="text-sm block mb-1 font-bold">Desde</label>
                                        <input
                                            type="date"
                                            className="input"
                                            style={{ width: 'auto', marginBottom: 0 }}
                                            value={filters.startDate}
                                            onChange={e => setFilters({ ...filters, startDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-sm block mb-1 font-bold">Hasta</label>
                                        <input
                                            type="date"
                                            className="input"
                                            style={{ width: 'auto', marginBottom: 0 }}
                                            value={filters.endDate}
                                            onChange={e => setFilters({ ...filters, endDate: e.target.value })}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div>
                            <label className="text-sm block mb-1 font-bold">Empresa</label>
                            <select className="select" style={{ width: 'auto', marginBottom: 0 }} value={filters.company} onChange={e => setFilters({ ...filters, company: e.target.value })}>
                                <option value="TODAS">Todas las Empresas</option>
                                {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        </div>
                        <button onClick={fetchReport} className="btn" style={{ width: 'auto' }}>Filtrar</button>
                    </div>

                    {report && (
                        <>
                            <div className="flex gap-4 mb-8">
                                <button onClick={exportExcel} className="btn" style={{ background: '#10b981' }}>📊 Exportar Excel</button>
                                <button onClick={exportPDF} className="btn" style={{ background: '#ef4444' }}>📄 Exportar PDF</button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                                {Object.entries(report.summary).map(([key, val]) => (
                                    <div key={key} className="card text-center" style={{ marginBottom: 0, border: key === 'TOTAL' ? '2px solid var(--primary)' : 'none', background: key === 'TOTAL' ? '#334155' : '#1e293b' }}>
                                        <h3 className="text-sm text-gray-400 mb-1">{key}</h3>
                                        <p className="text-3xl font-bold text-white">{val}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="card">
                                <h2 className="text-xl font-bold mb-4 uppercase tracking-wide text-primary">Detalle de Pedidos</h2>
                                <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0', textAlign: 'left' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 10 }}>
                                            <tr style={{ borderBottom: '2px solid #475569' }}>
                                                <th style={{ padding: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Cod.</th>
                                                <th style={{ padding: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Fecha / Hora</th>
                                                <th style={{ padding: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Nombre Trabajador</th>
                                                <th style={{ padding: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Empresa</th>
                                                <th style={{ padding: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Tipo Entrega</th>
                                                <th style={{ padding: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Colación</th>
                                                <th style={{ padding: '1rem', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Cant.</th>
                                                <th style={{ padding: '1rem', minWidth: '150px', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Invitados</th>
                                                <th style={{ padding: '1rem', minWidth: '150px', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Detalle</th>
                                                <th style={{ padding: '1rem', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Impreso</th>
                                                <th style={{ padding: '1rem', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Firma</th>
                                                <th style={{ padding: '1rem', textTransform: 'uppercase', fontSize: '0.85rem', color: '#94a3b8' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {report.orders.map(o => (
                                                <tr key={o.id} style={{ borderBottom: '1px solid #334155', transition: 'background-color 0.2s', ':hover': { backgroundColor: '#334155' } }}>
                                                    <td style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '0.9rem', opacity: 0.8 }}>{o.id}</td>
                                                    <td style={{ padding: '1rem', fontSize: '0.95rem' }}>
                                                        <div className="font-bold">{o.date_str}</div>
                                                        <div className="text-xs text-gray-400">
                                                            {(() => {
                                                                const d = new Date(o.created_at);
                                                                return !isNaN(d) ? d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
                                                            })()}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '1rem', fontWeight: '500' }}>{o.worker_name}</td>
                                                    <td style={{ padding: '1rem', opacity: 0.9 }}>{o.company}</td>
                                                    <td style={{ padding: '1rem' }} className={o.type.includes('llevar') ? 'text-primary' : 'text-success'}>
                                                        <span style={{ fontWeight: 'bold' }}>{o.type.toUpperCase()}</span>
                                                        {o.pickup_time && <div className="text-xs text-gray-400 mt-1 flex items-center gap-1">⏱️ {o.pickup_time}</div>}
                                                    </td>
                                                    <td style={{ padding: '1rem' }}>
                                                        <span className={`badge ${o.meal_type === 'CENA' ? 'bg-indigo-900 text-indigo-200' : 'bg-orange-900 text-orange-200'}`} style={{ fontSize: '0.75rem' }}>
                                                            {o.meal_type || 'ALMUERZO'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '1rem', fontWeight: 'bold', fontSize: '1.1rem', textAlign: 'center' }}>{o.quantity || 1}</td>
                                                    <td style={{ padding: '1rem', fontSize: '0.85rem', opacity: 0.8, lineHeight: '1.4' }}>
                                                        {o.guest_names && o.guest_names !== '-' ? (
                                                            <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'disc' }}>
                                                                {o.guest_names.split(',').map((name, i) => (
                                                                    <li key={i} style={{ marginBottom: '0.2rem' }}>{name.trim()}</li>
                                                                ))}
                                                            </ul>
                                                        ) : '-'}
                                                    </td>
                                                    <td style={{ padding: '1rem', fontSize: '0.85rem', color: '#fb923c', fontStyle: 'italic', minWidth: '200px' }}>
                                                        {o.order_detail && o.order_detail !== '-' ? (
                                                            <div style={{ whiteSpace: 'pre-wrap' }}>
                                                                {o.order_detail.includes(',') || o.order_detail.includes('\n') ? (
                                                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', listStyleType: 'circle' }}>
                                                                        {o.order_detail.split(/,|\n/).map((detail, i) => (detail.trim() &&
                                                                            <li key={i} style={{ marginBottom: '0.2rem' }}>{detail.trim()}</li>
                                                                        ))}
                                                                    </ul>
                                                                ) : o.order_detail}
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                    <td
                                                        style={{ padding: '1rem', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                                                        onClick={() => togglePrintStatus(o.id, !!o.printed)}
                                                        title="Clic para cambiar estado"
                                                    >
                                                        {o.printed ? (
                                                            <span className="badge bg-green-600 text-white" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>✅ LISTO</span>
                                                        ) : (
                                                            <span className="badge bg-red-600 text-white" style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}>🔴 PENDIENTE</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '1rem', textAlign: 'center' }}>{o.signature ? '✅' : <span className="text-gray-600">waiting</span>}</td>
                                                    <td style={{ padding: '1rem' }}>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handlePrintTicket(o.id)}
                                                                className="btn-sm btn-outline text-primary hover:bg-blue-900 border-blue-800"
                                                                style={{ borderColor: '#1e3a8a', color: '#60a5fa', height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: '6px' }}
                                                                title="Imprimir Ticket"
                                                            >
                                                                🖨️
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteOrder(o.id)}
                                                                className="btn-sm btn-outline text-danger hover:bg-red-900 border-red-800"
                                                                style={{ borderColor: '#7f1d1d', color: '#f87171', height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderRadius: '6px' }}
                                                                title="Eliminar Pedido"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* --- WORKERS --- */}
            {activeTab === 'workers' && (
                <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))' }}>
                    <div>
                        <div className="card mb-6">
                            <h2 className="text-xl font-bold mb-4">Agregar Trabajador</h2>
                            <form onSubmit={handleAddWorker} className="flex flex-col gap-4">
                                <input className="input" placeholder="RUT (ej: 12345678-9)" value={newWorker.rut} onChange={e => setNewWorker({ ...newWorker, rut: e.target.value })} />
                                <input className="input" placeholder="Nombre Completo" value={newWorker.name} onChange={e => setNewWorker({ ...newWorker, name: e.target.value })} />
                                <input className="input" placeholder="Centro de Costo (Opcional)" value={newWorker.cost_center} onChange={e => setNewWorker({ ...newWorker, cost_center: e.target.value })} />
                                <select className="select" value={newWorker.company} onChange={e => setNewWorker({ ...newWorker, company: e.target.value })}>
                                    <option value="" disabled>Seleccionar Empresa</option>
                                    {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                                <label className="flex items-center gap-2 cursor-pointer p-2 border border-gray-700 rounded hover:bg-gray-800">
                                    <input type="checkbox" checked={newWorker.is_premium} onChange={e => setNewWorker({ ...newWorker, is_premium: e.target.checked })} style={{ width: '20px', height: '20px' }} />
                                    <span className="font-bold text-primary">Usuario Premium (Multiple Colaciones)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer p-2 border border-gray-700 rounded hover:bg-gray-800">
                                    <input type="checkbox" checked={newWorker.is_plus} onChange={e => setNewWorker({ ...newWorker, is_plus: e.target.checked })} style={{ width: '20px', height: '20px' }} />
                                    <span className="font-bold" style={{ color: '#8b5cf6' }}>Usuario Plus (2 Colaciones)</span>
                                </label>
                                <button className="btn mt-2">Guardar Trabajador</button>
                            </form>
                        </div>
                        <div className="card">
                            <h2 className="text-xl font-bold mb-4">Carga Masiva (Excel)</h2>
                            <p className="text-sm mb-4 text-gray-400">Seleccione un archivo Excel (`.xlsx`) con las columnas: <b>RUT, Nombre, Empresa, Centro de Costo, Premium, Plus</b>.</p>
                            <form onSubmit={handleBulkUpload} className="flex gap-2 items-center">
                                <input type="file" accept=".xlsx, .xls" className="input mb-0" onChange={e => setWorkerFile(e.target.files[0])} />
                                <button className="btn btn-outline">Subir</button>
                            </form>
                        </div>
                    </div>
                    <div className="card">
                        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                            <h2 className="text-xl font-bold">Lista ({filteredWorkers.length})</h2>
                            <div className="flex gap-2 items-center flex-wrap">
                                <input
                                    className="input py-1 text-sm"
                                    style={{ width: '200px', marginBottom: 0 }}
                                    placeholder="Buscar por Nombre o RUT..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                                {selectedWorkers.size > 0 && (
                                    <button onClick={handleBulkDelete} className="btn-sm text-white" style={{ background: '#ef4444' }}>
                                        Borrar Selección ({selectedWorkers.size})
                                    </button>
                                )}
                                <select
                                    className="select text-sm py-1"
                                    style={{ width: 'auto', marginBottom: 0 }}
                                    value={workerFilterCompany}
                                    onChange={e => setWorkerFilterCompany(e.target.value)}
                                >
                                    <option value="TODAS">Todas las Empresas</option>
                                    {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ maxHeight: '600px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                            {filteredWorkers.map(w => (
                                <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', padding: '1rem 0' }}>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedWorkers.has(w.id)}
                                            onChange={() => toggleWorkerSelection(w.id)}
                                            style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                        />
                                        <div>
                                            <div className="font-bold text-lg mb-1">{w.name}</div>
                                            <div className="text-sm text-gray-400 flex flex-wrap gap-2 items-center">
                                                <span className="bg-gray-700 px-2 py-0.5 rounded text-white text-xs">{w.company}</span>
                                                {w.cost_center && <span className="bg-gray-800 px-2 py-0.5 rounded text-gray-300 text-xs border border-gray-600">{w.cost_center}</span>}
                                                <span style={{ opacity: 0.7 }}>•</span>
                                                <span>{w.rut}</span>
                                                {!!w.is_premium && (
                                                    <>
                                                        <span style={{ opacity: 0.7 }}>•</span>
                                                        <span className="text-primary font-bold text-xs border border-primary px-1 rounded">PREMIUM</span>
                                                    </>
                                                )}
                                                {!!w.is_plus && !w.is_premium && (
                                                    <>
                                                        <span style={{ opacity: 0.7 }}>•</span>
                                                        <span className="font-bold text-xs border px-1 rounded" style={{ color: '#8b5cf6', borderColor: '#8b5cf6' }}>PLUS</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => viewWorkerConsumption(w.rut)}
                                            className="btn-sm btn-outline text-primary"
                                            style={{ fontSize: '0.75rem', borderColor: 'currentColor' }}
                                        >
                                            📜 Ver Consumo
                                        </button>
                                        <button
                                            onClick={() => handleDeleteWorker(w.id)}
                                            className="btn-sm btn-outline text-danger hover:bg-red-900 border-red-800"
                                            style={{ borderColor: '#7f1d1d', color: '#f87171', height: '32px', width: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                            title="Eliminar"
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )
            }

            {/* --- COMPANIES --- */}
            {
                activeTab === 'companies' && (
                    <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                        <div className="card" style={{ height: 'fit-content' }}>
                            <h2 className="text-xl font-bold mb-4">Nueva / Editar Empresa</h2>
                            <form onSubmit={handleAddCompany} className="flex flex-col gap-4">
                                <input className="input" placeholder="Nombre Fantasía *" required value={newCompany.name} onChange={e => setNewCompany({ ...newCompany, name: e.target.value })} />
                                <input className="input" placeholder="RUT Empresa" value={newCompany.rut || ''} onChange={e => setNewCompany({ ...newCompany, rut: e.target.value })} />
                                <input className="input" placeholder="Dirección Comercial" value={newCompany.address || ''} onChange={e => setNewCompany({ ...newCompany, address: e.target.value })} />

                                <h3 className="text-sm font-bold text-gray-400 mt-2">Contacto Administrativo</h3>
                                <input className="input" placeholder="Nombre Contacto" value={newCompany.contact_name || ''} onChange={e => setNewCompany({ ...newCompany, contact_name: e.target.value })} />
                                <input className="input" placeholder="Email Contacto" value={newCompany.contact_email || ''} onChange={e => setNewCompany({ ...newCompany, contact_email: e.target.value })} />
                                <input className="input" placeholder="Teléfono Contacto" value={newCompany.contact_phone || ''} onChange={e => setNewCompany({ ...newCompany, contact_phone: e.target.value })} />

                                <div>
                                    <label className="block mb-1 text-sm font-bold text-gray-400">Logo de la Empresa (Opcional)</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <input type="file" className="input" style={{ marginBottom: 0 }} accept="image/*" onChange={handleLogoChange} />
                                        {(companyPreview || newCompany.logo_path) && (
                                            <div style={{ width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', background: '#0f172a' }}>
                                                <img
                                                    src={companyPreview || newCompany.logo_path}
                                                    alt="Preview"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button className="btn">{newCompany.id ? 'Actualizar Empresa' : 'Guardar Empresa'}</button>
                            </form>
                        </div>
                        <div className="card">
                            <h2 className="text-xl font-bold mb-4">Empresas Registradas</h2>
                            {companies.map(c => (
                                <div key={c.id} style={{ borderBottom: '1px solid #334155', padding: '1rem 0' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                            <div style={{ width: '50px', height: '50px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                {c.logo_path ? (
                                                    <img src={c.logo_path} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <span className="text-gray-500 text-xs">Logo</span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="font-bold text-lg text-primary">{c.name}</div>
                                                <div className="text-sm text-gray-400">{c.rut}</div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => setNewCompany(c)} className="btn-sm btn-outline" style={{ fontSize: '0.75rem' }}>✏️ Editar</button>
                                            <button onClick={() => handleDeleteCompany(c.id)} className="btn-sm btn-outline text-danger" style={{ fontSize: '0.75rem', borderColor: '#ef4444' }}>🗑️</button>
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-400 pl-16 mt-2 space-y-1">
                                        <p className="flex items-center gap-2">📍 {c.address || 'Sin dirección'}</p>
                                        <p className="flex items-center gap-2">👤 {c.contact_name ? `${c.contact_name} (${c.contact_phone || '-'} / ${c.contact_email || '-'})` : 'Sin contacto'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            }

            {/* --- AJUSTES --- */}
            {activeTab === 'settings_tab' && (
                <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <h2 className="text-xl font-bold mb-6 text-primary">Ajustes del Sistema</h2>
                    <form onSubmit={async (e) => {
                        e.preventDefault();
                        const res = await fetch('/api/settings', {
                            method: 'POST',
                            body: JSON.stringify(settings),
                            headers: { 'Content-Type': 'application/json' }
                        });
                        if (res.ok) alert('Ajustes guardados');
                        else alert('Error al guardar ajustes');
                    }} className="flex flex-col gap-6">
                        <div>
                            <label className="text-sm block mb-2 font-bold text-gray-400">Nombre del Restaurante</label>
                            <input
                                className="input"
                                value={settings.restaurant_name}
                                onChange={e => setSettings({ ...settings, restaurant_name: e.target.value })}
                                placeholder="Ej: RESTAUTANTE DOS"
                            />
                        </div>
                        <div>
                            <label className="text-sm block mb-2 font-bold text-gray-400">URL del Logo (Supabase)</label>
                            <input
                                className="input"
                                value={settings.restaurant_logo}
                                onChange={e => setSettings({ ...settings, restaurant_logo: e.target.value })}
                                placeholder="https://..."
                            />
                            {settings.restaurant_logo && (
                                <div className="mt-4 p-4 bg-white rounded-lg inline-block">
                                    <p className="text-xs text-gray-500 mb-2">Vista Previa:</p>
                                    <img src={settings.restaurant_logo} alt="Preview" style={{ height: '60px' }} />
                                </div>
                            )}
                        </div>
                        <button type="submit" className="btn">Guardar Cambios</button>
                    </form>
                </div>
            )}
        </div >
    );
}
