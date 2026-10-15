import { useEffect, useState, useMemo, useRef } from 'react';
import { Loader as Loader2, Clock, ChefHat, CircleCheck as CheckCircle2, Phone, MapPin, Utensils, ShoppingBasket, Bike, RefreshCw, Trash as Trash2, Receipt as ReceiptIcon, Banknote, Wallet, Plus, Minus, X, ShoppingBag, Printer, Bell, Pencil } from 'lucide-react';
import { supabase, type Order, type Product, type Category, type OrderItem } from '@/lib/supabase';
import { getCartItemId } from '@/context/CartContext';
import { formatCurrency } from '@/lib/format';
import { CAFE_NAME } from '@/lib/constants';
import { ReceiptModal } from '@/components/ReceiptModal';

type AdminOrdersProps = {
  refreshTrigger: number;
  onOrdersChanged?: () => void;
};

type OrderType = 'dine-in' | 'takeaway' | 'delivery';

type ManualCartItem = {
  id: string;
  product_id: string;
  name: string;
  variant_name?: string;
  price: number;
  quantity: number;
  tax_percentage: number;
};

const STATUS_CONFIG = {
  pending_approval: { label: 'Needs Approval', color: 'bg-amber-100 text-amber-800 border-amber-300', icon: Bell },
  pending: { label: 'Pending', color: 'bg-sage-100 text-sage-800 border-sage-300', icon: Clock },
  preparing: { label: 'Preparing', color: 'bg-blue-100 text-blue-800 border-blue-300', icon: ChefHat },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-300', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'bg-stone-100 text-stone-600 border-stone-300', icon: X },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-300', icon: X },
} as const;

const ORDER_TYPE_ICON = {
  'dine-in': Utensils,
  takeaway: ShoppingBasket,
  delivery: Bike,
} as const;

export function AdminOrders({ refreshTrigger, onOrdersChanged }: AdminOrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending_approval' | 'pending' | 'preparing' | 'completed'>('pending_approval');
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [receiptType, setReceiptType] = useState<'kot' | 'customer'>('customer');
  const [cafeAddress, setCafeAddress] = useState('I-8 Markaz, Islamabad');
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const [newOrderAlert, setNewOrderAlert] = useState<Order | null>(null);

  // POS modal state
  const [showPOS, setShowPOS] = useState(false);
  const [posProducts, setPosProducts] = useState<Product[]>([]);
  const [posCategories, setPosCategories] = useState<Category[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [posOrderType, setPosOrderType] = useState<OrderType>('dine-in');
  const [posName, setPosName] = useState('');
  const [posPhone, setPosPhone] = useState('');
  const [posTable, setPosTable] = useState('');
  const [posAddress, setPosAddress] = useState('');
  const [posCart, setPosCart] = useState<ManualCartItem[]>([]);
  const [posActiveCat, setPosActiveCat] = useState('');
  const [posSubmitting, setPosSubmitting] = useState(false);
  const [posError, setPosError] = useState('');
  const [posVariantProduct, setPosVariantProduct] = useState<Product | null>(null);
  const [posDiscountType, setPosDiscountType] = useState<'percent' | 'flat'>('percent');
  const [posDiscountValue, setPosDiscountValue] = useState('');
  const [posShowDiscount, setPosShowDiscount] = useState(false);

  // Edit order state
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [editCart, setEditCart] = useState<ManualCartItem[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDiscountType, setEditDiscountType] = useState<'percent' | 'flat'>('percent');
  const [editDiscountValue, setEditDiscountValue] = useState('');
  const [editShowDiscount, setEditShowDiscount] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!cancelled && !error) setOrders((data as Order[]).map((order) => ({ ...order, payment_status: order.payment_status ?? 'unpaid' })));
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [refreshTrigger]);

  useEffect(() => {
    async function loadAddress() {
      const { data } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'cafe_address')
        .maybeSingle();
      if (data?.value) setCafeAddress(data.value);
    }
    loadAddress();
  }, []);

  // === Real-time new order detection via polling ===
  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const notes = [880, 1108.73, 1318.51];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        const start = ctx.currentTime + i * 0.15;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
        osc.start(start);
        osc.stop(start + 0.3);
      });
    } catch {
      // Audio not available (e.g. before user interaction)
    }
  };

  const showBrowserNotification = (order: Order) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('New Order Received!', {
          body: `${order.customer_name} — ${order.order_type.replace('-', ' ')} · ${formatCurrency(order.total)}`,
          tag: order.id,
        });
      } catch {
        // Notification creation failed
      }
    }
  };

  useEffect(() => {
    // Seed known IDs from the initial load so we don't alert on existing orders
    if (orders.length > 0 && knownOrderIdsRef.current.size === 0) {
      orders.forEach((o) => knownOrderIdsRef.current.add(o.id));
    }
  }, [orders]);

  useEffect(() => {
    // Request notification permission on mount
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const interval = setInterval(async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error || !data) return;

      const freshOrders = (data as Order[]).map((order) => ({ ...order, payment_status: order.payment_status ?? 'unpaid' }));
      const newPending: Order[] = [];

      freshOrders.forEach((o) => {
        if (!knownOrderIdsRef.current.has(o.id) && (o.status === 'pending' || o.status === 'pending_approval')) {
          newPending.push(o);
          knownOrderIdsRef.current.add(o.id);
        }
      });

      if (newPending.length > 0) {
        setOrders(freshOrders);
        playNotificationSound();
        showBrowserNotification(newPending[0]);
        setNewOrderAlert(newPending[0]);
        onOrdersChanged?.();
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [onOrdersChanged]);

  const updateStatus = async (id: string, status: Order['status']) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    const updateData: Record<string, unknown> = { status };
    if (status === 'preparing') {
      updateData.accepted_at = new Date().toISOString();
    }
    try {
      const { error } = await supabase.from('orders').update(updateData).eq('id', id);
      if (error) throw error;
      // Free up the table if completed/cancelled/rejected
      if (status === 'completed' || status === 'cancelled' || status === 'rejected') {
        await supabase.from('tables').update({ status: 'vacant', current_order_id: null }).eq('current_order_id', id);
      }
    } catch {
      alert('Failed to update order status');
    }
  };

  const updatePaymentStatus = async (id: string, payment_status: Order['payment_status']) => {
    const previous = orders.find((order) => order.id === id)?.payment_status ?? 'unpaid';
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, payment_status } : o)));

    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ payment_status })
        .eq('id', id)
        .select('id, payment_status')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('The order was not found.');
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, payment_status: data.payment_status } : o)));
    } catch (err) {
      console.error('Failed to update payment status:', err);
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, payment_status: previous } : o)));
      alert('Payment status could not be saved. Please try again.');
    }
  };

  const openReceipt = (order: Order, type: 'kot' | 'customer') => {
    setReceiptOrder(order);
    setReceiptType(type);
  };

  const reloadOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) setOrders(data as Order[]);
  };

  const handleDelete = async (id: string, customerName: string) => {
    if (!confirm(`Delete order for "${customerName}"? This action cannot be undone.`)) return;
    try {
      const { error, count } = await supabase
        .from('orders')
        .delete({ count: 'exact' })
        .eq('id', id);
      if (error) throw error;
      if (count === 0) throw new Error('No rows were deleted — the order may have already been removed.');
      setOrders((prev) => prev.filter((o) => o.id !== id));
      onOrdersChanged?.();
    } catch (err) {
      alert('Failed to delete order. Reloading the list.');
      console.error('Delete failed:', err);
      reloadOrders();
    }
  };

  // === Edit order helpers ===
  const openEdit = (order: Order) => {
    setEditOrder(order);
    setEditNotes(order.notes ?? '');
    setEditDiscountType((order.total_discount_type as 'percent' | 'flat') || 'percent');
    setEditDiscountValue(order.total_discount_value ? String(order.total_discount_value) : '');
    setEditShowDiscount(Number(order.total_discount_amount) > 0);
    setEditCart(order.items.map((item, idx) => ({
      id: `${item.id}-${idx}`,
      product_id: item.id,
      name: item.name,
      variant_name: item.variant_name,
      price: item.price,
      quantity: item.quantity,
      tax_percentage: item.tax_percentage ?? 0,
    })));
  };

  const editSubtotal = editCart.reduce((s, i) => s + i.price * i.quantity, 0);
  const editTax = editCart.reduce((s, i) => s + i.price * i.quantity * (i.tax_percentage / 100), 0);
  const editDiscountAmount = useMemo(() => {
    const val = Number(editDiscountValue) || 0;
    if (editDiscountType === 'percent') return Math.min(editSubtotal * (val / 100), editSubtotal);
    return Math.min(val, editSubtotal);
  }, [editDiscountType, editDiscountValue, editSubtotal]);
  const editTotal = Math.max(0, editSubtotal - editDiscountAmount + editTax);

  const incrementEditItem = (id: string) => setEditCart((prev) => prev.map((i) => i.id === id ? { ...i, quantity: i.quantity + 1 } : i));
  const decrementEditItem = (id: string) => setEditCart((prev) => prev.map((i) => i.id === id ? { ...i, quantity: i.quantity - 1 } : i).filter((i) => i.quantity > 0));
  const removeEditItem = (id: string) => setEditCart((prev) => prev.filter((i) => i.id !== id));

  const handleSaveEdit = async () => {
    if (!editOrder) return;
    setEditSubmitting(true);
    try {
      const items: OrderItem[] = editCart.map((i) => ({
        id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        tax_percentage: i.tax_percentage,
        variant_name: i.variant_name,
      }));
      const wasKotPrinted = editOrder.kot_printed;
      const { error } = await supabase.from('orders').update({
        items,
        subtotal: editSubtotal,
        tax: editTax,
        total: editTotal,
        final_total: editTotal,
        notes: editNotes,
        total_discount_type: editDiscountAmount > 0 ? editDiscountType : '',
        total_discount_value: Number(editDiscountValue) || 0,
        total_discount_amount: editDiscountAmount,
        kot_modified: wasKotPrinted ? true : editOrder.kot_modified,
      }).eq('id', editOrder.id);
      if (error) throw error;
      setEditOrder(null);
      await reloadOrders();
      onOrdersChanged?.();
    } catch {
      alert('Failed to save order changes');
    } finally {
      setEditSubmitting(false);
    }
  };

  // === POS modal helpers ===

  const openPOS = async () => {
    setShowPOS(true);
    setPosError('');
    if (posProducts.length === 0) {
      setPosLoading(true);
      try {
        const [{ data: cats }, { data: prods }] = await Promise.all([
          supabase.from('categories').select('*').order('sort_order', { ascending: true }),
          supabase.from('products').select('*').order('sort_order', { ascending: true }),
        ]);
        const mappedCats = (cats ?? []) as unknown as Category[];
        const mappedProds = (prods ?? []) as unknown as Product[];
        setPosCategories(mappedCats);
        setPosProducts(mappedProds);
        if (mappedCats.length > 0) setPosActiveCat(mappedCats[0].id);
      } catch {
        setPosError('Failed to load menu items.');
      } finally {
        setPosLoading(false);
      }
    }
  };

  const resetPOS = () => {
    setPosOrderType('dine-in');
    setPosName('');
    setPosPhone('');
    setPosTable('');
    setPosAddress('');
    setPosCart([]);
    setPosDiscountValue('');
    setPosShowDiscount(false);
    setPosError('');
  };

  const closePOS = () => {
    setShowPOS(false);
    resetPOS();
  };

  const addToCart = (p: Product, variant = p.variants[0]) => {
    const variantName = variant?.name;
    const cartItemId = getCartItemId(p.id, variantName);
    setPosCart((prev) => {
      const existing = prev.find((item) => item.id === cartItemId);
      if (existing) {
        return prev.map((item) => (item.id === cartItemId ? { ...item, quantity: item.quantity + 1 } : item));
      }
      return [
        ...prev,
        {
          id: cartItemId,
          product_id: p.id,
          name: p.name,
          variant_name: variantName,
          price: variant?.price ?? p.price,
          quantity: 1,
          tax_percentage: p.tax_percentage ?? 0,
        },
      ];
    });
  };

  const incrementCart = (id: string) => {
    setPosCart((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i)));
  };

  const decrementCart = (id: string) => {
    setPosCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setPosCart((prev) => prev.filter((i) => i.id !== id));
  };

  const posSubtotal = posCart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const posTax = posCart.reduce((sum, i) => {
    const rate = i.tax_percentage / 100;
    return sum + i.price * i.quantity * rate;
  }, 0);
  const posDiscountAmount = useMemo(() => {
    const val = Number(posDiscountValue) || 0;
    if (posDiscountType === 'percent') return Math.min(posSubtotal * (val / 100), posSubtotal);
    return Math.min(val, posSubtotal);
  }, [posDiscountType, posDiscountValue, posSubtotal]);
  const posTotal = Math.max(0, posSubtotal - posDiscountAmount + posTax);

  const posFilteredProducts = useMemo(
    () => posProducts.filter((p) => p.category_id === posActiveCat),
    [posProducts, posActiveCat]
  );

  const handleConfirmPOS = async () => {
    setPosError('');
    if (!posName.trim()) {
      setPosError('Customer name is required.');
      return;
    }
    if (posOrderType === 'dine-in' && !posTable.trim()) {
      setPosError('Table number is required for dine-in orders.');
      return;
    }
    if (posOrderType === 'delivery' && !posAddress.trim()) {
      setPosError('Delivery address is required.');
      return;
    }
    if (posCart.length === 0) {
      setPosError('Please add at least one item to the order.');
      return;
    }

    setPosSubmitting(true);
    try {
      const items: OrderItem[] = posCart.map((i) => ({
        id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        tax_percentage: i.tax_percentage,
        variant_name: i.variant_name,
      }));

      const { data, error } = await supabase
        .from('orders')
        .insert({
          customer_name: posName.trim(),
          phone: posPhone.trim() || '—',
          order_type: posOrderType,
          table_number: posTable.trim(),
          address: posAddress.trim(),
          items,
          subtotal: posSubtotal,
          tax: posTax,
          total: posTotal,
          final_total: posTotal,
          total_discount_type: posDiscountAmount > 0 ? posDiscountType : '',
          total_discount_value: Number(posDiscountValue) || 0,
          total_discount_amount: posDiscountAmount,
          status: 'pending_approval',
          payment_method: 'cash',
          transaction_id: null,
        })
        .select()
        .maybeSingle();

      if (error) throw error;

      const newOrder = data as unknown as Order;
      await reloadOrders();
      onOrdersChanged?.();

      // Close POS modal and reset form
      setShowPOS(false);
      resetPOS();

      // Trigger the customer receipt print modal
      setReceiptType('customer');
      setReceiptOrder(newOrder);
    } catch (err) {
      setPosError('Failed to create order. ' + (err as Error).message);
    } finally {
      setPosSubmitting(false);
    }
  };

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
  const counts = {
    all: orders.length,
    pending_approval: orders.filter((o) => o.status === 'pending_approval').length,
    pending: orders.filter((o) => o.status === 'pending').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    completed: orders.filter((o) => o.status === 'completed').length,
  };

  return (
    <div className="space-y-5">
      {/* Header row with New Order button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-white rounded-xl border border-stone-200 p-1.5 w-fit overflow-x-auto">
          {(['all', 'pending_approval', 'pending', 'preparing', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all whitespace-nowrap ${
                filter === f ? 'bg-sage-900 text-sage-50' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {f}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === f ? 'bg-sage-50/20' : 'bg-stone-100'}`}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={openPOS}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-sage-900 text-sage-50 text-sm font-bold hover:bg-sage-800 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Order
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-sage-800 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-200 py-16 text-center">
          <RefreshCw className="w-10 h-10 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-400 font-medium">No orders here yet</p>
          <p className="text-sm text-stone-300 mt-1">New orders will appear in real time</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((order) => {
            const statusKey = (order.status in STATUS_CONFIG ? order.status : 'pending') as keyof typeof STATUS_CONFIG;
            const StatusIcon = STATUS_CONFIG[statusKey].icon;
            const TypeIcon = ORDER_TYPE_ICON[order.order_type];
            const created = new Date(order.created_at);
            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-stone-400 font-medium">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </p>
                    <h3 className="font-bold text-stone-900 mt-0.5">{order.customer_name}</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_CONFIG[statusKey].color}`}
                    >
                      <StatusIcon className="w-3.5 h-3.5" />
                      {STATUS_CONFIG[statusKey].label}
                    </span>
                    <button
                      onClick={() => updatePaymentStatus(order.id, order.payment_status === 'paid' ? 'unpaid' : 'paid')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${
                        order.payment_status === 'paid'
                          ? 'bg-green-100 text-green-800 border-green-300 hover:bg-green-200'
                          : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                      }`}
                      aria-label={`Mark order as ${order.payment_status === 'paid' ? 'unpaid' : 'paid'}`}
                    >
                      {order.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                    </button>
                  </div>
                </div>

                {/* Meta */}
                <div className="flex flex-wrap gap-3 text-xs text-stone-500">
                  <span className="flex items-center gap-1.5">
                    <TypeIcon className="w-3.5 h-3.5" />
                    <span className="capitalize">{order.order_type.replace('-', ' ')}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5" />
                    {order.phone}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {order.payment_method === 'online' ? (
                      <><Wallet className="w-3.5 h-3.5" /> Online</>
                    ) : (
                      <><Banknote className="w-3.5 h-3.5" /> Cash</>
                    )}
                  </span>
                  <span className="text-stone-400">
                    {created.toLocaleDateString()} {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {order.payment_method === 'online' && order.transaction_id && (
                  <p className="text-xs text-stone-500 flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-stone-700">TID: {order.transaction_id}</span>
                  </p>
                )}

                {order.order_type === 'dine-in' && order.table_number && (
                  <p className="text-xs text-stone-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Table: {order.table_number}
                  </p>
                )}
                {order.order_type === 'delivery' && order.address && (
                  <p className="text-xs text-stone-500 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5" /> {order.address}
                  </p>
                )}

                {/* Items */}
                <div className="bg-stone-50 rounded-xl p-3 space-y-1.5">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-stone-700">
                        {item.name} <span className="text-stone-400">×{item.quantity}</span>
                      </span>
                      <span className="font-medium text-stone-600">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center pt-1 border-t border-stone-100">
                  <span className="text-sm text-stone-500">Total (incl. tax)</span>
                  <span className="font-bold text-sage-900">{formatCurrency(Number(order.final_total || order.total))}</span>
                </div>
                {Number(order.total_discount_amount) > 0 && (
                  <div className="flex justify-between text-xs text-green-600">
                    <span>Discount applied</span>
                    <span>-{formatCurrency(Number(order.total_discount_amount))}</span>
                  </div>
                )}

                {/* Status actions */}
                <div className="flex gap-2 flex-wrap">
                  {/* Approval buttons for pending_approval */}
                  {order.status === 'pending_approval' && (
                    <>
                      <button
                        onClick={() => updateStatus(order.id, 'preparing')}
                        className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Accept
                      </button>
                      <button
                        onClick={() => updateStatus(order.id, 'rejected')}
                        className="flex-1 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                  {/* Regular status buttons for non-pending_approval */}
                  {order.status !== 'pending_approval' && order.status !== 'completed' && order.status !== 'cancelled' && order.status !== 'rejected' && (
                    <>
                      {order.status !== 'pending' && (
                        <button
                          onClick={() => updateStatus(order.id, 'pending')}
                          className="flex-1 py-2 rounded-lg border border-sage-300 text-sage-700 text-xs font-semibold hover:bg-sage-50 transition-colors"
                        >
                          Pending
                        </button>
                      )}
                      {order.status !== 'preparing' && (
                        <button
                          onClick={() => updateStatus(order.id, 'preparing')}
                          className="flex-1 py-2 rounded-lg border border-blue-300 text-blue-700 text-xs font-semibold hover:bg-blue-50 transition-colors"
                        >
                          Preparing
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(order.id, 'completed')}
                        className="flex-1 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors"
                      >
                        Complete
                      </button>
                    </>
                  )}
                  {/* KOT button — always available */}
                  <button
                    onClick={() => openReceipt(order, 'kot')}
                    className="px-3 py-2 rounded-lg border border-orange-300 text-orange-700 text-xs font-semibold hover:bg-orange-50 transition-colors flex items-center gap-1"
                    title="Print kitchen receipt"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    KOT
                  </button>
                  <button
                    onClick={() => openReceipt(order, 'customer')}
                    className="px-3 py-2 rounded-lg border border-sage-300 text-sage-700 text-xs font-semibold hover:bg-sage-50 transition-colors flex items-center gap-1"
                    title="Print customer receipt"
                  >
                    <ReceiptIcon className="w-3.5 h-3.5" />
                    Receipt
                  </button>
                  <button
                    onClick={() => openEdit(order)}
                    disabled={order.status === 'completed' || order.status === 'cancelled' || order.status === 'rejected'}
                    className="px-3 py-2 rounded-lg border border-stone-300 text-stone-600 text-xs font-semibold hover:bg-stone-50 transition-colors flex items-center gap-1 disabled:opacity-40"
                    title="Edit order items"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(order.id, order.customer_name)}
                    className="px-3 py-2 rounded-lg border border-red-300 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors flex items-center gap-1"
                    title="Delete order"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New order alert popup */}
      {newOrderAlert && (
        <div className="fixed top-4 right-4 z-[95] bg-white rounded-xl shadow-2xl border-2 border-sage-500 p-4 w-80 animate-in slide-in-from-right">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-sage-100 flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-sage-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-stone-900 text-sm">New Order Received!</h4>
              <p className="text-xs text-stone-600 mt-1">
                {newOrderAlert.customer_name} · {newOrderAlert.order_type.replace('-', ' ')}
              </p>
              <p className="text-xs font-semibold text-sage-900 mt-0.5">
                {formatCurrency(newOrderAlert.total)} · {newOrderAlert.items.length} item{newOrderAlert.items.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    openReceipt(newOrderAlert, 'customer');
                    setNewOrderAlert(null);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-sage-900 text-sage-50 text-xs font-semibold hover:bg-sage-800 transition-colors"
                >
                  View Receipt
                </button>
                <button
                  onClick={() => setNewOrderAlert(null)}
                  className="px-3 py-1.5 rounded-lg text-stone-500 text-xs font-semibold hover:bg-stone-100 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              onClick={() => setNewOrderAlert(null)}
              className="p-1 text-stone-300 hover:text-stone-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          cafeAddress={cafeAddress}
          receiptType={receiptType}
          onClose={() => setReceiptOrder(null)}
        />
      )}

      {/* POS / New Order modal */}
      {showPOS && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
          <div className="bg-stone-50 rounded-none sm:rounded-2xl shadow-2xl w-full max-w-4xl h-full sm:max-h-[92vh] overflow-hidden flex flex-col">
            {/* POS Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 bg-white border-b border-stone-200 flex-shrink-0">
              <h3 className="font-bold text-lg text-stone-900 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-sage-800" />
                Create New Order
              </h3>
              <button
                onClick={closePOS}
                className="p-2 rounded-full hover:bg-stone-100 transition-colors"
              >
                <X className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            {/* POS Body: two columns on desktop, stacked scroll on mobile */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="flex flex-col lg:flex-row min-h-full">
                {/* Left: Customer details + cart */}
                <div className="lg:w-[400px] flex-shrink-0 bg-white lg:border-r border-stone-200 p-4 sm:p-5 space-y-4">
                  {/* Order type */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">
                      Customer Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'dine-in', label: 'Dine-In', icon: Utensils },
                        { value: 'takeaway', label: 'Takeaway', icon: ShoppingBasket },
                        { value: 'delivery', label: 'Delivery', icon: Bike },
                      ] as { value: OrderType; label: string; icon: typeof Utensils }[]).map(
                        ({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            onClick={() => setPosOrderType(value)}
                            className={`flex flex-col items-center gap-1.5 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                              posOrderType === value
                                ? 'border-sage-500 bg-sage-50 text-sage-900'
                                : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                            {label}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Customer fields */}
                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      value={posName}
                      onChange={(e) => setPosName(e.target.value)}
                      placeholder="Customer name"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={posPhone}
                      onChange={(e) => setPosPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400"
                    />
                  </div>

                  {posOrderType === 'dine-in' && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                        Table Number *
                      </label>
                      <input
                        type="text"
                        value={posTable}
                        onChange={(e) => setPosTable(e.target.value)}
                        placeholder="e.g. T5"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400"
                      />
                    </div>
                  )}

                  {posOrderType === 'delivery' && (
                    <div>
                      <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide mb-1.5">
                        Delivery Address *
                      </label>
                      <textarea
                        value={posAddress}
                        onChange={(e) => setPosAddress(e.target.value)}
                        rows={2}
                        placeholder="Full delivery address"
                        className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400 resize-none"
                      />
                    </div>
                  )}

                  {/* Cart */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-semibold text-stone-600 uppercase tracking-wide">
                        Order Items
                      </label>
                      {posCart.length > 0 && (
                        <button
                          onClick={() => setPosCart([])}
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    {posCart.length === 0 ? (
                      <div className="bg-stone-50 rounded-lg p-4 text-center text-sm text-stone-400 border border-dashed border-stone-200">
                        Tap items to add them
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[200px] sm:max-h-[240px] overflow-y-auto overscroll-contain">
                        {posCart.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center gap-2 bg-stone-50 rounded-lg p-2.5"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-stone-800 truncate">
                                {item.name}{item.variant_name ? ` (${item.variant_name})` : ''}
                              </p>
                              <p className="text-xs text-stone-500">
                                {formatCurrency(item.price)} each
                              </p>
                            </div>
                            <div className="flex items-center gap-1 bg-white rounded-full border border-stone-200">
                              <button
                                onClick={() => decrementCart(item.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-700 touch-manipulation"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="min-w-[20px] text-center text-xs font-bold text-stone-800">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => incrementCart(item.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-100 text-stone-700 touch-manipulation"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <span className="text-sm font-bold text-sage-900 min-w-[60px] text-right">
                              {formatCurrency(item.price * item.quantity)}
                            </span>
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Totals */}
                  {posCart.length > 0 && (
                    <div className="space-y-1.5 text-sm pt-2 border-t border-stone-100">
                      <div className="flex justify-between text-stone-600">
                        <span>Subtotal</span>
                        <span className="font-medium">{formatCurrency(posSubtotal)}</span>
                      </div>
                      {posDiscountAmount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount</span>
                          <span className="font-medium">-{formatCurrency(posDiscountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-stone-600">
                        <span>Tax</span>
                        <span className="font-medium">{formatCurrency(posTax)}</span>
                      </div>

                      {/* Discount toggle */}
                      {!posShowDiscount ? (
                        <button
                          onClick={() => setPosShowDiscount(true)}
                          className="text-xs text-sage-600 font-semibold pt-1 hover:text-sage-700"
                        >
                          + Add Discount
                        </button>
                      ) : (
                        <div className="bg-stone-50 rounded-lg p-2.5 mt-1 space-y-2">
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setPosDiscountType('percent')}
                              className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${posDiscountType === 'percent' ? 'bg-sage-900 text-sage-50' : 'bg-white border border-stone-200 text-stone-600'}`}
                            >% Percent</button>
                            <button
                              onClick={() => setPosDiscountType('flat')}
                              className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${posDiscountType === 'flat' ? 'bg-sage-900 text-sage-50' : 'bg-white border border-stone-200 text-stone-600'}`}
                            >Rs Flat</button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={posDiscountValue}
                              onChange={(e) => setPosDiscountValue(e.target.value)}
                              placeholder={posDiscountType === 'percent' ? '0%' : 'Rs 0'}
                              className="w-full px-2.5 py-1.5 rounded-md border border-stone-200 text-sm outline-none focus:border-sage-400"
                            />
                            <button
                              onClick={() => { setPosDiscountValue(''); setPosShowDiscount(false); }}
                              className="text-stone-400 hover:text-red-500 p-1"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between text-stone-900 font-bold text-base pt-1.5 border-t border-stone-100">
                        <span>Total</span>
                        <span className="text-sage-900">{formatCurrency(posTotal)}</span>
                      </div>
                    </div>
                  )}

                  {posError && (
                    <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{posError}</p>
                  )}
                </div>

                {/* Right: Item picker */}
                <div className="flex-1 p-4 sm:p-5 flex flex-col min-h-0">
                  {/* Category tabs */}
                  {posLoading ? (
                    <div className="flex-1 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-sage-800 animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-1.5 mb-4 flex-wrap overflow-x-auto overscroll-contain pb-1">
                        {posCategories.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setPosActiveCat(cat.id)}
                            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap touch-manipulation ${
                              posActiveCat === cat.id
                                ? 'bg-sage-900 text-sage-50'
                                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                            }`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>

                      {/* Products grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto overscroll-contain flex-1" style={{ maxHeight: 'calc(92vh - 300px)' }}>
                        {posFilteredProducts.map((p) => {
                          const inCart = posCart
                            .filter((i) => i.product_id === p.id)
                            .reduce(
                              (acc, i) => (acc ? { ...acc, quantity: acc.quantity + i.quantity } : i),
                              undefined as ManualCartItem | undefined
                            );
                          return (
                            <button
                              key={p.id}
                              onClick={() => (p.variants.length > 1 ? setPosVariantProduct(p) : addToCart(p))}
                              disabled={!p.is_in_stock}
                              className={`relative flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                inCart
                                  ? 'border-sage-500 bg-sage-50'
                                  : 'border-stone-200 bg-white hover:border-sage-300 hover:bg-sage-50/30'
                              }`}
                            >
                              {inCart && (
                                <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-sage-600 text-white text-[10px] font-bold flex items-center justify-center">
                                  {inCart.quantity}
                                </span>
                              )}
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="w-full h-16 rounded-lg object-cover"
                              />
                              <p className="text-xs font-semibold text-stone-800 leading-tight line-clamp-2">
                                {p.name}
                              </p>
                              <p className="text-xs font-bold text-sage-900">
                                {p.variants.length > 0
                                  ? `From ${formatCurrency(Math.min(...p.variants.map((variant) => variant.price)))}`
                                  : formatCurrency(p.price)}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* POS Footer: Confirm & Print */}
            <div className="border-t border-stone-200 bg-white px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
              <div className="text-sm text-stone-600">
                {posCart.length > 0 ? (
                  <span>
                    <span className="font-bold text-stone-900">{posCart.length}</span> item{posCart.length !== 1 ? 's' : ''} ·{' '}
                    <span className="font-bold text-sage-900">{formatCurrency(posTotal)}</span>
                  </span>
                ) : (
                  <span className="text-stone-400">No items added yet</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={closePOS}
                  className="px-4 py-2.5 rounded-lg text-stone-600 font-semibold text-sm hover:bg-stone-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPOS}
                  disabled={posSubmitting || posCart.length === 0}
                  className="px-5 py-2.5 rounded-lg bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {posSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      Confirm & Print
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POS variant picker modal */}
      {posVariantProduct && (
        <div
          className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPosVariantProduct(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-stone-900">{posVariantProduct.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">Select a size</p>
              </div>
              <button
                onClick={() => setPosVariantProduct(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 transition-colors"
              >
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <div className="space-y-2">
              {posVariantProduct.variants.map((variant) => (
                <button
                  key={variant.name}
                  onClick={() => {
                    addToCart(posVariantProduct, variant);
                    setPosVariantProduct(null);
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-stone-200 hover:border-sage-400 hover:bg-sage-50/50 transition-all text-left"
                >
                  <span className="font-semibold text-stone-800 text-sm">{variant.name}</span>
                  <span className="font-bold text-sage-900 text-sm">{formatCurrency(variant.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Order modal */}
      {editOrder && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditOrder(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-stone-900">Edit Order</h3>
                <p className="text-xs text-stone-500 mt-0.5">#{editOrder.id.slice(0, 8).toUpperCase()} · {editOrder.customer_name}</p>
                {editOrder.kot_printed && (
                  <span className="inline-block mt-1 text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">KOT Printed — changes will flag MODIFIED</span>
                )}
              </div>
              <button onClick={() => setEditOrder(null)} className="p-1.5 rounded-full hover:bg-stone-100"><X className="w-4 h-4 text-stone-500" /></button>
            </div>

            <div className="space-y-2 mb-4">
              {editCart.map((item) => (
                <div key={item.id} className="flex items-center gap-2 bg-stone-50 rounded-lg p-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-stone-800 truncate">{item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</p>
                    <p className="text-xs text-stone-500">{formatCurrency(item.price)} each</p>
                  </div>
                  <div className="flex items-center gap-1 bg-white rounded-full border border-stone-200">
                    <button onClick={() => decrementEditItem(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100"><Minus className="w-3 h-3 text-stone-700" /></button>
                    <span className="min-w-[18px] text-center text-xs font-bold">{item.quantity}</span>
                    <button onClick={() => incrementEditItem(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100"><Plus className="w-3 h-3 text-stone-700" /></button>
                  </div>
                  <span className="text-sm font-bold text-sage-900 min-w-[60px] text-right">{formatCurrency(item.price * item.quantity)}</span>
                  <button onClick={() => removeEditItem(item.id)} className="p-1 text-stone-300 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
              {editCart.length === 0 && <div className="text-center py-6 text-sm text-stone-400">No items in this order</div>}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-stone-600 uppercase mb-1.5">Order Notes</label>
              <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Add notes..." className="w-full px-3.5 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400" />
            </div>

            <div className="space-y-1.5 text-sm border-t border-stone-100 pt-3 mb-4">
              <div className="flex justify-between text-stone-600"><span>Subtotal</span><span>{formatCurrency(editSubtotal)}</span></div>
              {editDiscountAmount > 0 && (
                <div className="flex justify-between text-green-600"><span>Discount</span><span>-{formatCurrency(editDiscountAmount)}</span></div>
              )}
              <div className="flex justify-between text-stone-600"><span>Tax</span><span>{formatCurrency(editTax)}</span></div>

              {/* Discount controls */}
              {!editShowDiscount ? (
                <button onClick={() => setEditShowDiscount(true)} className="text-xs text-sage-600 font-semibold pt-1 hover:text-sage-700">+ Add Discount</button>
              ) : (
                <div className="bg-stone-50 rounded-lg p-2.5 mt-1 space-y-2">
                  <div className="flex gap-1.5">
                    <button onClick={() => setEditDiscountType('percent')} className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${editDiscountType === 'percent' ? 'bg-sage-900 text-sage-50' : 'bg-white border border-stone-200 text-stone-600'}`}>% Percent</button>
                    <button onClick={() => setEditDiscountType('flat')} className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${editDiscountType === 'flat' ? 'bg-sage-900 text-sage-50' : 'bg-white border border-stone-200 text-stone-600'}`}>Rs Flat</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" value={editDiscountValue} onChange={(e) => setEditDiscountValue(e.target.value)} placeholder={editDiscountType === 'percent' ? '0%' : 'Rs 0'} className="w-full px-2.5 py-1.5 rounded-md border border-stone-200 text-sm outline-none focus:border-sage-400" />
                    <button onClick={() => { setEditDiscountValue(''); setEditShowDiscount(false); }} className="text-stone-400 hover:text-red-500 p-1"><X className="w-4 h-4" /></button>
                  </div>
                </div>
              )}

              <div className="flex justify-between font-bold text-stone-900 pt-1.5 border-t border-stone-100"><span>Total</span><span className="text-sage-900">{formatCurrency(editTotal)}</span></div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setEditOrder(null)} className="px-4 py-2.5 rounded-lg border border-stone-300 text-stone-600 font-semibold text-sm hover:bg-stone-100">Cancel</button>
              <button onClick={handleSaveEdit} disabled={editSubmitting || editCart.length === 0} className="flex-1 py-2.5 rounded-lg bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 disabled:opacity-50 flex items-center justify-center gap-2">
                {editSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
