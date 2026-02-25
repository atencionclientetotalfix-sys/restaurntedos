
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  // States
  const [rut, setRut] = useState('');
  const [step, setStep] = useState(1); // 1: RUT, 2: Confirm & Order
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderType, setOrderType] = useState('local'); // local | llevar
  const [mealType, setMealType] = useState('ALMUERZO'); // ALMUERZO | CENA
  const [quantity, setQuantity] = useState(1);
  const [pickupTime, setPickupTime] = useState('');
  const [pickupName, setPickupName] = useState('');
  const [guestNames, setGuestNames] = useState('');
  const [orderDetail, setOrderDetail] = useState('');
  const [signature, setSignature] = useState('');
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
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

  // Drawing Logic
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignature(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setSignature('');
    }
  };

  // Generate time slots (24h format, 30 min intervals, 11:00 to 23:00)
  const generateTimeSlots = () => {
    const slots = [];
    const start = 11 * 60; // 11:00
    const limit = 23 * 60; // 23:00

    for (let minutes = start; minutes <= limit; minutes += 30) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      const hStr = h.toString().padStart(2, '0');
      const mStr = m.toString().padStart(2, '0');
      slots.push(`${hStr}:${mStr}`);
    }
    return slots;
  };
  const timeSlots = generateTimeSlots();

  const handleCheckRut = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // En un caso real buscariamos por API, pero nuestra API de "workers" devuelve TODOS.
      // Para verificar existencia individual sin traer toda la lista, idealmente tendriamos endpoint especifico.
      // Pero podemos usar la lista completa si es pequeña ~1000 workers es nada.
      // O mejor: intentamos hacer el pedido? No, necesitamos mostrar info primero.
      // Simularemos busqueda trayendo lista. (Optimización pendiente para v2).

      const res = await fetch('/api/workers');
      const workers = await res.json();

      // Also fetch companies to get logos (Optimization: API should return joined data, but we do client-side join for surgeon speed)
      const resComp = await fetch('/api/companies');
      const companies = await resComp.json();

      const cleanRut = rut.trim().replace(/\./g, '').replace(/\s/g, '').toUpperCase();
      console.log('Debugging Login:');
      console.log('Input RUT (raw):', rut);
      console.log('Input RUT (clean):', cleanRut);
      console.log('Workers found:', workers.length);
      if (workers.length > 0) {
        console.log('Sample Worker RUT:', workers[0].rut);
        console.log('Does it match first worker?', workers[0].rut === cleanRut);
      }
      const found = workers.find(w => w.rut === cleanRut);

      if (found) {
        // Attach logo
        const comp = companies.find(c => c.name === found.company);
        if (comp) found.company_logo = comp.logo_path;

        setWorker(found);
        setStep(2);
        setQuantity(1); // Reset
        setPickupName(found.name); // Default to worker name
        setPickupTime(''); // Reset time
      } else {
        setError('RUT no encontrado en la lista oficial. Contacte a RESTAUTANTE DOS.');
      }

    } catch (err) {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitOrder = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        body: JSON.stringify({
          rut: worker.rut,
          type: orderType,
          quantity: quantity,
          pickup_time: pickupTime,
          pickup_name: pickupName,
          signature: signature,
          meal_type: mealType,
          guest_names: guestNames,
          order_detail: orderDetail
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push(`/ticket/${data.ticket.id}`);
      } else {
        setError(data.error || 'Error al procesar el pedido.');
      }

    } catch (err) {
      setError('Error al enviar el pedido.');
    } finally {
      setLoading(false);
    }
  };

  const renderQuantitySection = () => {
    if (worker.is_premium === 1) {
      return (
        <div className="mb-8 p-4 rounded-lg border border-gray-700 bg-gray-900/50">
          <div className="mb-2">
            <label className="text-sm block mb-2 text-primary font-bold">CANTIDAD (PREMIUM - MÁX. 50)</label>
            <input
              type="number"
              className="input"
              style={{ textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}
              min="1"
              max="50"
              value={quantity}
              onChange={e => {
                const val = parseInt(e.target.value);
                if (!isNaN(val)) {
                  setQuantity(Math.min(50, Math.max(1, val)));
                } else if (e.target.value === '') {
                  setQuantity('');
                }
              }}
              onBlur={() => {
                if (quantity === '' || isNaN(quantity)) setQuantity(1);
              }}
            />
          </div>

          {quantity > 1 && (
            <div className="mt-4 fade-in">
              <label className="text-sm block mb-2 text-primary font-bold">NOMBRES DE INVITADOS</label>
              <p className="text-xs text-gray-400 mb-2">Ingrese los nombres de las personas para quienes pide las colaciones extra (separados por coma).</p>
              <textarea
                className="input"
                rows="3"
                placeholder="Ej: Juan Perez, Maria Gonzalez..."
                value={guestNames}
                onChange={e => setGuestNames(e.target.value)}
              />
            </div>
          )}
        </div>
      );
    }

    if (worker.is_plus === 1) {
      return (
        <div className="mb-8 p-4 rounded-lg border border-gray-700 bg-gray-900/50">
          <div className="mb-2">
            <label className="text-sm block mb-2 text-primary font-bold">CANTIDAD (PLUS)</label>
            <select
              className="select"
              value={quantity}
              onChange={e => setQuantity(parseInt(e.target.value))}
            >
              {[1, 2].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {quantity > 1 && (
            <div className="mt-4 fade-in">
              <label className="text-sm block mb-2 text-primary font-bold">NOMBRES DE INVITADOS</label>
              <p className="text-xs text-gray-400 mb-2">Ingrese para quién es la segunda colación.</p>
              <textarea
                className="input"
                rows="3"
                placeholder="Ej: Juan Perez"
                value={guestNames}
                onChange={e => setGuestNames(e.target.value)}
              />
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <main className="container">

      <div className="text-center mb-8 fade-in">
        {settings.restaurant_logo && (
          <img
            src={settings.restaurant_logo}
            alt="Logo"
            style={{ height: '80px', marginBottom: '1.5rem', borderRadius: '12px' }}
          />
        )}
        <h1 className="text-primary font-bold text-3xl" style={{ marginBottom: '0.5rem' }}>{settings.restaurant_name}</h1>
        <p className="text-sm text-gray-400">Sistema de Colaciones</p>
      </div>

      <div className="card fade-in">
        {step === 1 && (
          <form onSubmit={handleCheckRut}>
            <h2 className="text-2xl font-bold mb-6 text-center text-gradient">Identifíquese</h2>
            <div className="mb-2">
              <label className="text-sm block mb-2 text-center text-primary">INGRESE SU RUT</label>
              <input
                type="text"
                className="input"
                placeholder="12.345.678-9"
                value={rut}
                onChange={e => setRut(e.target.value)}
                autoFocus
              />
            </div>
            {error && <p className="text-danger text-center mb-6 font-bold">{error}</p>}

            <button type="submit" className="btn btn-shiny" disabled={loading}>
              {loading ? 'VERIFICANDO...' : 'COMENZAR PEDIDO'}
            </button>

            <a
              href="https://wa.me/56987610190"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-whatsapp btn-shiny"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="icon">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
              </svg>
              <span>CONTACTAR POR WHATSAPP</span>
            </a>
          </form>
        )}

        {step === 2 && worker && (
          <div className="text-center fade-in">
            <div className="mb-8">
              <p className="text-sm text-gray-400 mb-2">Bienvenido,</p>
              <h2 className="text-2xl font-bold text-primary mb-4">{worker.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                {worker.company_logo && <img src={worker.company_logo} alt={worker.company} style={{ height: '32px', background: 'rgba(255,255,255,0.9)', borderRadius: '6px', padding: '2px' }} />}
                <span className="badge">{worker.company}</span>
                {!!worker.is_premium && <span className="badge badge-premium">PREMIUM</span>}
                {!!worker.is_plus && !worker.is_premium && <span className="badge" style={{ background: '#8b5cf6', color: 'white' }}>PLUS</span>}
              </div>
            </div>

            <div className="mb-8">
              <p className="text-sm block mb-4">Seleccione Tipo de Colación</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                <button
                  className={`btn ${mealType === 'ALMUERZO' ? '' : 'btn-outline'}`}
                  onClick={() => setMealType('ALMUERZO')}
                  style={{ height: '60px', fontWeight: 'bold' }}
                >
                  ☀️ ALMUERZO
                </button>
                <button
                  className={`btn ${mealType === 'CENA' ? '' : 'btn-outline'}`}
                  onClick={() => setMealType('CENA')}
                  style={{ height: '60px', fontWeight: 'bold' }}
                >
                  🌙 CENA
                </button>
              </div>

              <p className="text-sm block mb-4">¿Cómo desea su pedido?</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <button
                  className={`btn ${orderType === 'local' ? '' : 'btn-outline'}`}
                  onClick={() => setOrderType('local')}
                  style={{ height: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🍽️</span>
                  <span>LOCAL</span>
                </button>
                <button
                  className={`btn ${orderType === 'llevar' ? '' : 'btn-outline'}`}
                  onClick={() => setOrderType('llevar')}
                  style={{ height: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
                >
                  <span style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🥡</span>
                  <span>LLEVAR</span>
                </button>
              </div>
            </div>

            {/* Pickup Details - FOR ALL users if 'LLEVAR' */}
            {orderType === 'llevar' && (
              <div className="mb-6 fade-in p-4 rounded-lg border border-gray-700 bg-gray-900/50">
                <label className="text-sm block mb-2 text-primary font-bold">DETALLES DEL RETIRO</label>

                <div className="mb-4">
                  <label className="text-xs block mb-1 text-gray-400">Hora de Retiro (11:00 - 23:00)</label>
                  <select
                    className="select"
                    value={pickupTime}
                    onChange={e => setPickupTime(e.target.value)}
                    style={{ marginBottom: '1rem', textAlign: 'center' }}
                  >
                    <option value="">Seleccionar Hora</option>
                    {timeSlots.map(time => (
                      <option key={time} value={time}>{time}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="text-xs block mb-1 text-gray-400">¿Quién retira? (Por defecto: Ud.)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Nombre de quien retira"
                    value={pickupName}
                    onChange={e => setPickupName(e.target.value)}
                  />
                </div>

                <div className="mb-2">
                  <label className="text-sm block mb-2 text-primary font-bold">DETALLE DEL PEDIDO</label>
                  <div className="bg-blue-900/30 border border-blue-500/30 rounded p-3 mb-2">
                    <p className="text-xs text-blue-200 mb-2">
                      ℹ️ <b>IMPORTANTE:</b> El menú está disponible en el WhatsApp del restaurante.
                    </p>
                    <a
                      href="https://wa.me/56987610190"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-whatsapp btn-shiny"
                      style={{ padding: '0.75rem', fontSize: '0.9rem' }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className="icon">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.008-.57-.008-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                      </svg>
                      <span>PEDIR MENÚ (+569 8761 0190)</span>
                    </a>
                  </div>

                  {renderQuantitySection()}

                  <label className="text-xs block mb-1 text-gray-400">Indique qué llevará (Texto Libre)</label>
                  <textarea
                    className="input"
                    rows={Math.max(3, quantity)} // Dynamic rows
                    placeholder="Ej: Cazuela, Ensalada Chilena, Postre..."
                    value={orderDetail}
                    onChange={e => setOrderDetail(e.target.value)}
                  />
                </div>
              </div>
            )}

            {orderType === 'local' && (
              <>
                {renderQuantitySection()}
                <div className="mb-6 fade-in p-4 rounded-lg border border-gray-700 bg-gray-900/50">
                  <label className="text-sm block mb-2 text-primary font-bold">DETALLE DEL PEDIDO</label>
                  <label className="text-xs block mb-1 text-gray-400">Indique qué llevará (Texto Libre)</label>
                  <textarea
                    className="input"
                    rows="3"
                    placeholder="Ej: Cazuela, Ensalada Chilena, Postre..."
                    value={orderDetail}
                    onChange={e => setOrderDetail(e.target.value)}
                  />
                </div>
              </>
            )}

            {error && <p className="text-danger mb-4 font-bold">{error}</p>}

            {/* Signature Pad */}
            <div className="mb-6 fade-in p-4 rounded-lg border border-gray-700 bg-gray-900/50">
              <label className="text-sm block mb-2 text-primary font-bold">FIRMA DIGITAL (REQUERIDO)</label>
              <div style={{ background: '#fff', borderRadius: '8px', overflow: 'hidden', touchAction: 'none' }}>
                <canvas
                  ref={canvasRef}
                  width={320}
                  height={150}
                  style={{ width: '100%', height: '150px', cursor: 'crosshair' }}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={endDrawing}
                />
              </div>
              <button onClick={clearSignature} className="text-xs text-red-400 mt-2 hover:underline">Borrar Firma</button>
            </div>

            <div className="grid gap-4">
              <button onClick={handleSubmitOrder} className="btn" disabled={loading || !signature}>
                {loading ? 'PROCESANDO...' : 'CONFIRMAR PEDIDO'}
              </button>
              <button
                onClick={() => { setStep(1); setRut(''); setError(''); setSignature(''); setGuestNames(''); setOrderDetail(''); setMealType('ALMUERZO'); }}
                className="btn btn-outline"
                style={{ borderColor: '#64748b', color: '#94a3b8' }}
              >
                CANCELAR / CAMBIAR RUT
              </button>
            </div>
          </div>
        )}
      </div>

      <footer>
        <p>© 2026 {settings.restaurant_name}</p>
        <p className="text-xs text-gray-500 mt-2">
          Desarrollado por <a href="https://www.automatizafix.com/" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">TotalFix</a>
        </p>
      </footer>
    </main>
  );
}
