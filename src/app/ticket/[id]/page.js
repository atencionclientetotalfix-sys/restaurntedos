'use client';

// Client Component needed for html-to-image
import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';
import { toPng } from 'html-to-image';

import { useRouter, useSearchParams } from 'next/navigation';

export default function TicketPage({ params }) {
    // Unwrap params using use() because it's a Promise in newer Next.js versions
    const { id } = use(params);
    const searchParams = useSearchParams();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [countdown, setCountdown] = useState(10);
    const [isPaused, setIsPaused] = useState(false);
    const [settings, setSettings] = useState({ restaurant_name: 'RESTAUTANTE DOS', restaurant_logo: '' });
    const ticketRef = useRef(null);
    const router = useRouter();

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

    // Fetch order
    useEffect(() => {
        if (!id) return;
        fetch(`/api/order?id=${id}`)
            .then(res => res.json())
            .then(data => {
                if (data.error) setError(data.error);
                else setOrder(data);
                setLoading(false);
            })
            .catch(() => {
                setError('Error al cargar ticket');
                setLoading(false);
            });
    }, [id]);

    // Auto-print if requested
    useEffect(() => {
        if (!loading && order && searchParams.get('print') === 'true') {
            setIsPaused(true); // Stop countdown
            setTimeout(() => {
                window.print();
            }, 500); // Small delay to ensure render
        }
    }, [loading, order, searchParams]);

    // Countdown Timer Logic
    useEffect(() => {
        if (loading || error || isPaused) return;

        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [loading, error, isPaused]);

    // Navigation Effect - Separate from render/state update
    useEffect(() => {
        if (countdown === 0) {
            router.push('/');
        }
    }, [countdown, router]);

    const handleDownload = async () => {
        // Pause timer when interaction starts
        setIsPaused(true);

        if (ticketRef.current === null) return;

        try {
            // Wait a bit to ensure styles are stable
            const dataUrl = await toPng(ticketRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' });
            const link = document.createElement('a');
            link.download = `ticket-${settings.restaurant_name.replace(/\s+/g, '-').toLowerCase()}-${order.id}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error(err);
            alert('Error al descargar imagen');
        }
    };

    const handleStopTimer = () => {
        setIsPaused(true);
    };

    if (loading) return <div className="container text-center pt-20">Cargando ticket...</div>;

    if (error || !order) {
        return (
            <div className="container text-center" style={{ paddingTop: '5rem' }}>
                <h1 className="text-danger text-2xl font-bold">Ticket inválido o expirado.</h1>
                <p className="text-gray-400 mt-2">ID: {id}</p>
                <Link href="/" className="btn mt-4">Volver</Link>
            </div>
        );
    }

    const { worker_name, company, type, created_at, quantity, company_logo, pickup_time, pickup_name, date_str } = order;

    // Format Date/Time
    // created_at comes as ISO string from JSON, so just new Date(created_at)
    const dateObj = new Date(created_at);
    const timeStr = dateObj.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const dateEmisionStr = dateObj.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });

    // Parse order date (YYYY-MM-DD)
    const [y, m, d] = date_str.split('-');
    const datePedidoObj = new Date(y, m - 1, d);
    const datePedidoStr = datePedidoObj.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    const dayIndex = datePedidoObj.getDay(); // 0 (Sun) - 6 (Sat)

    // 7 Distinct Colors for Days (Sunday to Saturday)
    // Domingo (0), Lunes (1), Martes (2), Miércoles (3), Jueves (4), Viernes (5), Sábado (6)
    const DAY_COLORS = [
        '#db2777', // Domingo: Pink/Fuchsia
        '#dc2626', // Lunes: Red
        '#ea580c', // Martes: Orange
        '#d97706', // Miércoles: Amber/Gold (Darker yellow for visibility)
        '#16a34a', // Jueves: Green
        '#2563eb', // Viernes: Blue
        '#7c3aed'  // Sábado: Violet
    ];
    const ticketColor = DAY_COLORS[dayIndex];

    const isServe = type === 'local' || type === 'servirse' || type === 'serve';
    const isTakeaway = type === 'llevar' || type === 'takeaway';

    return (
        <>
            <main className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: '0.5rem' }}>

                <div ref={ticketRef} className="card" style={{
                    width: '100%',
                    maxWidth: '380px',
                    background: '#fff',
                    color: '#000',
                    textAlign: 'center',
                    padding: '1.5rem',
                    borderTop: `12px solid ${ticketColor}`, // Thicker colorful top border
                    borderBottom: `4px solid ${ticketColor}`, // Bottom border for consistency
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a' }}>{settings.restaurant_name}</h1>
                        <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Ticket de Colación</p>
                    </div>

                    <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '0.5rem', marginBottom: '1rem', border: `3px solid ${ticketColor}` }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#57534e', marginBottom: '0.25rem' }}>
                            {order.meal_type || 'ALMUERZO'}
                        </div>

                        <h2 style={{ fontSize: '2rem', fontWeight: '900', textTransform: 'uppercase', color: ticketColor, lineHeight: 1, margin: '0.5rem 0' }}>
                            {isServe ? '🍽️ LOCAL' : '🥡 LLEVAR'}
                        </h2>

                        {isTakeaway && pickup_time && (
                            <div style={{ marginTop: '0.5rem', fontSize: '1.2rem', color: '#c2410c', fontWeight: 'bold', borderTop: '1px dashed #ccc', paddingTop: '0.25rem' }}>
                                ⏰ {pickup_time}
                            </div>
                        )}

                        {(quantity > 1) && (
                            <div style={{ marginTop: '0.5rem', background: '#0f172a', color: 'white', padding: '0.25rem', borderRadius: '4px', fontWeight: 'bold', fontSize: '1rem' }}>
                                CANTIDAD: {quantity}
                                {order.guest_names && (
                                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1', fontWeight: 'normal', marginTop: '2px', fontStyle: 'italic' }}>
                                        {order.guest_names}
                                    </div>
                                )}
                            </div>
                        )}

                        {order.order_detail && order.order_detail !== '-' && (
                            <div style={{ marginTop: '0.5rem', textAlign: 'left', background: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>Detalles / Notas:</p>
                                <ul style={{ listStyleType: 'disc', paddingLeft: '1rem', margin: 0, fontSize: '0.95rem', fontWeight: '600', color: '#000' }}>
                                    {order.order_detail.split(/[.,]/).map((item, i) => {
                                        const trimmed = item.trim();
                                        if (!trimmed) return null;
                                        return <li key={i} style={{ marginBottom: '2px' }}>{trimmed}</li>;
                                    })}
                                </ul>
                            </div>
                        )}
                    </div>

                    <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>

                        {/* Fecha Pedido - ENLARGED */}
                        <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: ticketColor, color: 'white', borderRadius: '4px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.75rem', opacity: 0.9, display: 'block', textTransform: 'uppercase' }}>Fecha Pedido</span>
                            <span style={{ fontWeight: '900', fontSize: '1.4rem', textTransform: 'capitalize', lineHeight: 1.1 }}>{datePedidoStr}</span>
                        </div>

                        {/* Fecha Emisión */}
                        <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>EMISIÓN</span>
                            <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{timeStr}</span>
                        </div>

                        <div style={{ marginBottom: '0.5rem', paddingBottom: '0.25rem', borderBottom: '1px solid #e2e8f0' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>TRABAJADOR</span>
                            <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: '#000' }}>{worker_name}</span>
                        </div>

                        {isTakeaway && pickup_name && pickup_name !== worker_name && (
                            <div style={{ marginBottom: '0.5rem', paddingBottom: '0.25rem', borderBottom: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>RETIRA</span>
                                <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#c2410c' }}>{pickup_name}</span>
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                            <div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block' }}>EMPRESA</span>
                                <span style={{ fontWeight: 'bold', fontSize: '1rem', color: '#000' }}>{company}</span>
                            </div>
                            {company_logo && (
                                <img src={company_logo} alt="Logo" style={{ height: '35px', objectFit: 'contain' }} />
                            )}
                        </div>
                    </div>

                    <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '0.75rem', fontFamily: 'monospace', background: '#f8fafc', margin: '0 -1.5rem -1.5rem -1.5rem', padding: '0.75rem 1.5rem 1.5rem 1.5rem', borderBottomLeftRadius: '1rem', borderBottomRightRadius: '1rem' }}>
                        <p style={{ marginBottom: '0.25rem', color: '#64748b', fontSize: '0.75rem' }}>CÓDIGO PEDIDO</p>
                        <p style={{ fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '3px', color: '#334155' }}>{order.id}</p>
                        <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.5rem' }}>
                            <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: ticketColor }}>MOSTRAR AL PERSONAL</p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 text-center w-full max-w-sm">
                    {!isPaused ? (
                        <p className="text-gray-400 text-xs">
                            Redireccionando en <span className="text-primary font-bold text-base">{countdown}s</span>
                        </p>
                    ) : (
                        <p className="text-yellow-500 font-bold text-xs">⏳ Temporizador Pausado</p>
                    )}

                    <div className="flex gap-3 justify-center">
                        <button onClick={handleDownload} className="btn" style={{ background: '#ea580c', flex: 1, fontSize: '0.9rem', padding: '0.5rem' }}>
                            📥 Descargar JPG
                        </button>
                        <button onClick={handleStopTimer} className="btn-outline" style={{ borderColor: '#64748b', color: '#94a3b8', fontSize: '0.9rem', padding: '0.5rem' }}>
                            ⏸️ Pausar
                        </button>
                    </div>
                    <Link href="/" className="text-gray-500 text-xs hover:underline mt-1">
                        Volver al Inicio
                    </Link>
                </div>

            </main>
            <style jsx global>{`
                @media print {
                    body {
                        background: white !important;
                        color: black !important;
                    }
                    main {
                        background: white !important;
                        min-height: 0 !important;
                        padding: 0 !important;
                        display: block !important;
                    }
                    /* Hide buttons and countdown */
                    main > div:last-child {
                        display: none !important;
                    }
                    /* Ticket Card */
                    .card {
                        box-shadow: none !important;
                        border: 1px solid #ccc !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        page-break-inside: avoid;
                    }
                }
            `}</style>
        </>
    );
}
