import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Loader2, Plus, Minus, X, Search, Printer, ArrowLeft,
  Utensils, ShoppingBasket, Bike, Grid3x3, ClipboardList, CheckCircle2, Clock,
} from 'lucide-react';
import { supabase, type Product, type Category, type CafeTable, type CafeSection, type Order, type OrderItem } from '@/lib/supabase';
import { getCartItemId } from '@/context/CartContext';
import { formatCurrency } from '@/lib/format';

type WaiterPOSProps = {
  onBack: () => void;
};

type OrderType = 'dine-in' | 'takeaway' | 'delivery';

type PosCartItem = {
  id: string;
  product_id: string;
  name: string;
  variant_name?: string;
  price: number;
  quantity: number;
  tax_percentage: number;
  modifier_note: string;
};

const STEAK_TEMPS = ['Rare', 'Medium Rare', 'Medium', 'Medium Well', 'Well Done'];
const COMMON_MODIFIERS = ['No Ice', 'Extra Shot', 'Less Sugar', 'Extra Cheese', 'No Onion', 'Spicy', 'No Spicy'];

export function WaiterPOS({ onBack }: WaiterPOSProps) {
  const [sections, setSections] = useState<CafeSection[]>([]);
  const [tables, setTables] = useState<CafeTable[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tables' | 'menu'>('tables');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('dine-in');
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [activeCat, setActiveCat] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [variantProduct, setVariantProduct] = useState<Product | null>(null);
  const [modifierProduct, setModifierProduct] = useState<PosCartItem | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'flat'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [showDiscount, setShowDiscount] = useState(false);

  const loadInitial = useCallback(async () => {
    try {
      const [{ data: secs }, { data: tbls }, { data: cats }, { data: prods }] = await Promise.all([
        supabase.from('sections').select('*').order('sort_order', { ascending: true }),
        supabase.from('tables').select('*').order('table_number', { ascending: true }),
        supabase.from('categories').select('*').order('sort_order', { ascending: true }),
        supabase.from('products').select('*').order('sort_order', { ascending: true }),
      ]);

      const secList = (secs ?? []) as unknown as CafeSection[];
      const tblList = (tbls ?? []) as unknown as CafeTable[];
      const catList = (cats ?? []) as unknown as Category[];
      const prodList = (prods ?? []) as unknown as Product[];

      setSections(secList);
      setTables(tblList);
      setCategories(catList);
      setProducts(prodList);
      if (secList.length > 0) setSelectedSectionId(secList[0].id);
      if (catList.length > 0) setActiveCat(catList[0].id);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const filteredTables = useMemo(
    () => tables.filter((t) => t.section_id === selectedSectionId),
    [tables, selectedSectionId]
  );

  const filteredProducts = useMemo(() => {
    if (searchQuery.trim()) {
      return products.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return products.filter((p) => p.category_id === activeCat);
  }, [products, activeCat, searchQuery]);

  const addToCart = (p: Product, variantName?: string, variantPrice?: number) => {
    const vName = variantName || p.variants[0]?.name;
    const vPrice = variantPrice ?? p.variants[0]?.price ?? p.price;
    const cartItemId = getCartItemId(p.id, vName);

    setCart((prev) => {
      const existing = prev.find((item) => item.id === cartItemId);
      if (existing) {
        return prev.map((item) => item.id === cartItemId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, {
        id: cartItemId,
        product_id: p.id,
        name: p.name,
        variant_name: vName,
        price: vPrice,
        quantity: 1,
        tax_percentage: p.tax_percentage ?? 0,
        modifier_note: '',
      }];
    });
  };

  const increment = (id: string) => setCart((prev) => prev.map((i) => i.id === id ? { ...i, quantity: i.quantity + 1 } : i));
  const decrement = (id: string) => setCart((prev) => prev.filter((i, idx) => i.id === id ? i.quantity > 1 ? { ...i, quantity: i.quantity - 1 } : null : prev[idx]).filter(Boolean) as PosCartItem[]);
  const removeFromCart = (id: string) => setCart((prev) => prev.filter((i) => i.id !== id));
  const clearCart = () => { setCart([]); setSelectedTableId(null); setCustomerName(''); setDiscountValue(''); setShowDiscount(false); };

  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const tax = cart.reduce((s, i) => s + i.price * i.quantity * (i.tax_percentage / 100), 0);
  const discountAmount = useMemo(() => {
    const val = Number(discountValue) || 0;
    if (discountType === 'percent') return Math.min(subtotal * (val / 100), subtotal);
    return Math.min(val, subtotal);
  }, [discountType, discountValue, subtotal]);
  const total = Math.max(0, subtotal - discountAmount + tax);

  const selectedTable = tables.find((t) => t.id === selectedTableId);

  const handleSelectTable = (table: CafeTable) => {
    setSelectedTableId(table.id === selectedTableId ? null : table.id);
    setOrderType('dine-in');
    setActiveTab('menu');
  };

  const handleSubmit = async () => {
    setError('');
    if (cart.length === 0) { setError('Add at least one item'); return; }
    if (orderType === 'dine-in' && !selectedTable && !selectedTableId) { setError('Select a table for dine-in'); return; }

    setSubmitting(true);
    try {
      const items: OrderItem[] = cart.map((i) => ({
        id: i.product_id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        tax_percentage: i.tax_percentage,
        variant_name: i.variant_name,
        modifier_note: i.modifier_note || undefined,
      }));

      const tableNum = selectedTable?.table_number || '';

      const { data, error: err } = await supabase
        .from('orders')
        .insert({
          customer_name: customerName.trim() || 'Walk-in',
          phone: '—',
          order_type: orderType,
          table_number: tableNum,
          table_id: selectedTableId || null,
          address: '',
          items,
          subtotal,
          tax,
          total,
          final_total: total,
          total_discount_type: discountType,
          total_discount_value: Number(discountValue) || 0,
          total_discount_amount: discountAmount,
          status: 'pending_approval',
          payment_method: 'cash',
          transaction_id: null,
          kot_printed: false,
        })
        .select()
        .maybeSingle();

      if (err) throw err;

      const newOrder = data as unknown as Order;
      setLastOrder(newOrder);

      // Mark table as occupied
      if (selectedTableId) {
        await supabase
          .from('tables')
          .update({ status: 'occupied', current_order_id: newOrder.id })
          .eq('id', selectedTableId);
      }

      clearCart();
      loadInitial();
    } catch (err) {
      setError('Failed to create order: ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center pt-20">
        <Loader2 className="w-8 h-8 text-sage-800 animate-spin" />
      </div>
    );
  }

  // Last order confirmation screen
  if (lastOrder) {
    return (
      <div className="min-h-screen bg-stone-50 pt-20 md:pt-24 pb-12">
        <div className="max-w-md mx-auto px-4 py-8 text-center">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-stone-900">Order Sent to Kitchen!</h2>
          <p className="text-sm text-stone-500 mt-2">
            Order #{lastOrder.id.slice(0, 8).toUpperCase()} has been created and is awaiting approval.
          </p>

          <div className="bg-white rounded-2xl border border-stone-200 p-5 mt-6 text-left">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-stone-500">Items</span>
              <span className="font-semibold">{lastOrder.items.length}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-stone-500">Total</span>
              <span className="font-bold text-sage-900">{formatCurrency(Number(lastOrder.final_total || lastOrder.total))}</span>
            </div>
            {lastOrder.table_number && (
              <div className="flex justify-between text-sm">
                <span className="text-stone-500">Table</span>
                <span className="font-semibold">{lastOrder.table_number}</span>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => { setLastOrder(null); setActiveTab('tables'); }}
              className="flex-1 py-3 rounded-xl bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 transition-colors"
            >
              New Order
            </button>
            <button
              onClick={onBack}
              className="flex-1 py-3 rounded-xl border border-stone-300 text-stone-600 font-bold text-sm hover:bg-stone-100 transition-colors"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 pt-20 md:pt-24 pb-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-stone-200 transition-colors">
              <ArrowLeft className="w-5 h-5 text-stone-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-stone-900">Waiter POS</h1>
              <p className="text-xs text-stone-500">Quick order punching & KOT</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1.5 bg-white rounded-xl border border-stone-200 p-1.5">
            <button
              onClick={() => setActiveTab('tables')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'tables' ? 'bg-sage-900 text-sage-50' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Grid3x3 className="w-4 h-4" />
              Tables
            </button>
            <button
              onClick={() => setActiveTab('menu')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'menu' ? 'bg-sage-900 text-sage-50' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Menu
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-5">
          {/* Left: Tables or Menu */}
          <div>
            {activeTab === 'tables' ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                {/* Section tabs */}
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                  {sections.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => setSelectedSectionId(sec.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                        selectedSectionId === sec.id
                          ? 'bg-sage-900 text-sage-50'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {sec.name}
                    </button>
                  ))}
                </div>

                {/* Table grid */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {filteredTables.map((table) => {
                    const isSelected = table.id === selectedTableId;
                    const statusColor =
                      table.status === 'occupied' ? 'border-red-300 bg-red-50' :
                      table.status === 'reserved' ? 'border-amber-300 bg-amber-50' :
                      'border-stone-200 bg-white hover:border-sage-300';
                    return (
                      <button
                        key={table.id}
                        onClick={() => handleSelectTable(table)}
                        className={`relative flex flex-col items-center justify-center aspect-square rounded-xl border-2 p-2 transition-all ${
                          isSelected ? 'border-sage-600 bg-sage-50 ring-2 ring-sage-200' : statusColor
                        }`}
                      >
                        <span className="text-lg font-bold text-stone-800">{table.table_number}</span>
                        <span className={`text-[10px] font-semibold capitalize mt-1 ${
                          table.status === 'occupied' ? 'text-red-600' :
                          table.status === 'reserved' ? 'text-amber-600' : 'text-stone-400'
                        }`}>
                          {table.status}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="absolute top-1 right-1 w-4 h-4 text-sage-600" />
                        )}
                      </button>
                    );
                  })}
                  {filteredTables.length === 0 && (
                    <div className="col-span-full text-center py-10 text-stone-400 text-sm">
                      No tables in this section
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-stone-200 p-5">
                {/* Search + Category tabs */}
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search items..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-stone-100 border border-transparent focus:border-sage-400 focus:bg-white outline-none text-sm"
                  />
                </div>

                {!searchQuery.trim() && (
                  <div className="flex gap-1.5 mb-4 flex-wrap overflow-x-auto pb-1">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setActiveCat(cat.id)}
                        className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                          activeCat === cat.id ? 'bg-sage-900 text-sage-50' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Products grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {filteredProducts.map((p) => {
                    const inCartQty = cart
                      .filter((i) => i.product_id === p.id)
                      .reduce((s, i) => s + i.quantity, 0);
                    return (
                      <button
                        key={p.id}
                        onClick={() => p.variants.length > 1 ? setVariantProduct(p) : addToCart(p)}
                        disabled={!p.is_in_stock}
                        className={`relative flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all disabled:opacity-40 ${
                          inCartQty > 0 ? 'border-sage-500 bg-sage-50' : 'border-stone-200 bg-white hover:border-sage-300'
                        }`}
                      >
                        {inCartQty > 0 && (
                          <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-sage-600 text-white text-[10px] font-bold flex items-center justify-center">
                            {inCartQty}
                          </span>
                        )}
                        <img src={p.image_url} alt={p.name} className="w-full h-14 rounded-lg object-cover" />
                        <p className="text-xs font-semibold text-stone-800 leading-tight line-clamp-2">{p.name}</p>
                        <p className="text-xs font-bold text-sage-900">
                          {p.variants.length > 0
                            ? `From ${formatCurrency(Math.min(...p.variants.map((v) => v.price)))}`
                            : formatCurrency(p.price)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Cart / Order summary */}
          <div className="bg-white rounded-2xl border border-stone-200 p-5 flex flex-col lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
            {/* Order type */}
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {([
                { value: 'dine-in', label: 'Dine-In', icon: Utensils },
                { value: 'takeaway', label: 'Takeaway', icon: ShoppingBasket },
                { value: 'delivery', label: 'Delivery', icon: Bike },
              ] as { value: OrderType; label: string; icon: typeof Utensils }[]).map(
                ({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setOrderType(value)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-semibold transition-all ${
                      orderType === value ? 'border-sage-500 bg-sage-50 text-sage-900' : 'border-stone-200 text-stone-500'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                )
              )}
            </div>

            {/* Selected table */}
            {orderType === 'dine-in' && selectedTable && (
              <div className="bg-sage-50 border border-sage-200 rounded-lg px-3 py-2 mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-sage-900">Table {selectedTable.table_number}</span>
                <button onClick={() => setSelectedTableId(null)} className="text-stone-400 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {orderType === 'dine-in' && !selectedTable && (
              <button
                onClick={() => setActiveTab('tables')}
                className="bg-stone-50 border border-dashed border-stone-300 rounded-lg px-3 py-2 mb-3 text-sm text-stone-500 font-medium hover:bg-stone-100 transition-colors"
              >
                Select a table →
              </button>
            )}

            {/* Customer name */}
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400 mb-3"
            />

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto min-h-0 mb-3">
              {cart.length === 0 ? (
                <div className="bg-stone-50 rounded-lg p-6 text-center text-sm text-stone-400 border border-dashed border-stone-200">
                  Tap items to add
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 bg-stone-50 rounded-lg p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-800 truncate">
                          {item.name}{item.variant_name ? ` (${item.variant_name})` : ''}
                        </p>
                        {item.modifier_note && (
                          <p className="text-xs text-amber-600 italic truncate">{item.modifier_note}</p>
                        )}
                        <p className="text-xs text-stone-500">{formatCurrency(item.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1 bg-white rounded-full border border-stone-200">
                        <button onClick={() => decrement(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100">
                          <Minus className="w-3 h-3 text-stone-700" />
                        </button>
                        <span className="min-w-[18px] text-center text-xs font-bold">{item.quantity}</span>
                        <button onClick={() => increment(item.id)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-100">
                          <Plus className="w-3 h-3 text-stone-700" />
                        </button>
                      </div>
                      <button onClick={() => setModifierProduct(item)} className="text-xs text-sage-600 font-semibold px-1.5 py-1 rounded hover:bg-sage-50" title="Add modifiers">
                        Note
                      </button>
                      <button onClick={() => removeFromCart(item.id)} className="p-1 text-stone-300 hover:text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            {cart.length > 0 && (
              <div className="space-y-1.5 text-sm border-t border-stone-100 pt-3 mb-3">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-600">
                  <span>Tax</span>
                  <span>{formatCurrency(tax)}</span>
                </div>

                {/* Discount toggle */}
                {!showDiscount ? (
                  <button
                    onClick={() => setShowDiscount(true)}
                    className="text-xs text-sage-600 font-semibold pt-1 hover:text-sage-700"
                  >
                    + Add Discount
                  </button>
                ) : (
                  <div className="bg-stone-50 rounded-lg p-2.5 mt-1 space-y-2">
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setDiscountType('percent')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${discountType === 'percent' ? 'bg-sage-900 text-sage-50' : 'bg-white border border-stone-200 text-stone-600'}`}
                      >% Percent</button>
                      <button
                        onClick={() => setDiscountType('flat')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold ${discountType === 'flat' ? 'bg-sage-900 text-sage-50' : 'bg-white border border-stone-200 text-stone-600'}`}
                      >Rs Flat</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountType === 'percent' ? '0%' : 'Rs 0'}
                        className="w-full px-2.5 py-1.5 rounded-md border border-stone-200 text-sm outline-none focus:border-sage-400"
                      />
                      <button
                        onClick={() => { setDiscountValue(''); setShowDiscount(false); }}
                        className="text-stone-400 hover:text-red-500 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between font-bold text-base text-stone-900 pt-1.5 border-t border-stone-100">
                  <span>Total</span>
                  <span className="text-sage-900">{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">{error}</p>}

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={clearCart}
                disabled={cart.length === 0}
                className="px-4 py-3 rounded-xl border border-stone-300 text-stone-600 font-semibold text-sm hover:bg-stone-100 disabled:opacity-40"
              >
                Clear
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || cart.length === 0}
                className="flex-1 py-3 rounded-xl bg-sage-900 text-sage-50 font-bold text-sm hover:bg-sage-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Send to Kitchen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Variant picker */}
      {variantProduct && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setVariantProduct(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-stone-900">{variantProduct.name}</h3>
              <button onClick={() => setVariantProduct(null)} className="p-1.5 rounded-full hover:bg-stone-100">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>
            <div className="space-y-2">
              {variantProduct.variants.map((v) => (
                <button
                  key={v.name}
                  onClick={() => { addToCart(variantProduct, v.name, v.price); setVariantProduct(null); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-stone-200 hover:border-sage-400 hover:bg-sage-50/50 transition-all text-left"
                >
                  <span className="font-semibold text-stone-800 text-sm">{v.name}</span>
                  <span className="font-bold text-sage-900 text-sm">{formatCurrency(v.price)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modifier / Note picker */}
      {modifierProduct && (
        <div className="fixed inset-0 z-[85] bg-stone-950/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setModifierProduct(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-stone-900">{modifierProduct.name}</h3>
                <p className="text-xs text-stone-500 mt-0.5">Add modifiers / notes</p>
              </div>
              <button onClick={() => setModifierProduct(null)} className="p-1.5 rounded-full hover:bg-stone-100">
                <X className="w-4 h-4 text-stone-500" />
              </button>
            </div>

            {/* Quick modifiers */}
            <div className="flex flex-wrap gap-2 mb-4">
              {COMMON_MODIFIERS.map((mod) => (
                <button
                  key={mod}
                  onClick={() => {
                    const note = modifierProduct.modifier_note ? `${modifierProduct.modifier_note}, ${mod}` : mod;
                    setCart((prev) => prev.map((i) => i.id === modifierProduct.id ? { ...i, modifier_note: note } : i));
                    setModifierProduct({ ...modifierProduct, modifier_note: note });
                  }}
                  className="px-3 py-1.5 rounded-full bg-stone-100 text-xs font-semibold text-stone-700 hover:bg-sage-100 hover:text-sage-800 transition-colors"
                >
                  {mod}
                </button>
              ))}
            </div>

            {/* Steak temperature */}
            <p className="text-xs font-semibold text-stone-600 uppercase tracking-wide mb-2">Steak Temperature</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {STEAK_TEMPS.map((temp) => (
                <button
                  key={temp}
                  onClick={() => {
                    const note = modifierProduct.modifier_note ? `${modifierProduct.modifier_note}, ${temp}` : temp;
                    setCart((prev) => prev.map((i) => i.id === modifierProduct.id ? { ...i, modifier_note: note } : i));
                    setModifierProduct({ ...modifierProduct, modifier_note: note });
                  }}
                  className="px-3 py-1.5 rounded-full bg-stone-100 text-xs font-semibold text-stone-700 hover:bg-amber-100 hover:text-amber-800 transition-colors"
                >
                  {temp}
                </button>
              ))}
            </div>

            {/* Custom note */}
            <input
              type="text"
              value={modifierProduct.modifier_note}
              onChange={(e) => {
                const note = e.target.value;
                setCart((prev) => prev.map((i) => i.id === modifierProduct.id ? { ...i, modifier_note: note } : i));
                setModifierProduct({ ...modifierProduct, modifier_note: note });
              }}
              placeholder="Custom note..."
              className="w-full px-3 py-2.5 rounded-lg border border-stone-200 text-sm outline-none focus:border-sage-400"
            />

            <button
              onClick={() => setModifierProduct(null)}
              className="w-full mt-4 py-2.5 rounded-lg bg-sage-900 text-sage-50 font-semibold text-sm hover:bg-sage-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
