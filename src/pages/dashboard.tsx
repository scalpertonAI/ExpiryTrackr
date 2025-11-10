import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '@/lib/supabaseClient';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow, isPast, differenceInDays } from 'date-fns';

interface ExpiryItem {
  id: string;
  name: string;
  category: string;
  expiry_date: string;
  reminder_days_before: number;
  notes?: string;
  image_url?: string;
  status: 'active' | 'expired' | 'renewed';
  created_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '',
    category: 'document',
    expiry_date: '',
    reminder_days_before: 7,
    notes: '',
  });

  useEffect(() => {
    checkUser();
    fetchItems();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
    } else {
      setUser(user);
    }
  };

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('expiry_items')
        .select('*')
        .order('expiry_date', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      console.error('Error fetching items:', error);
      toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('expiry_items').insert([
        {
          ...newItem,
          user_id: user.id,
          status: 'active',
        },
      ]);

      if (error) throw error;

      toast.success('Item added successfully!');
      setShowAddModal(false);
      setNewItem({
        name: '',
        category: 'document',
        expiry_date: '',
        reminder_days_before: 7,
        notes: '',
      });
      fetchItems();
    } catch (error: any) {
      toast.error(error.message || 'Failed to add item');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase.from('expiry_items').delete().eq('id', id);

      if (error) throw error;
      toast.success('Item deleted successfully!');
      fetchItems();
    } catch (error: any) {
      toast.error('Failed to delete item');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getStatusBadge = (expiryDate: string) => {
    const daysUntilExpiry = differenceInDays(new Date(expiryDate), new Date());

    if (daysUntilExpiry < 0) {
      return <span className="badge badge-expired">Expired</span>;
    } else if (daysUntilExpiry <= 7) {
      return <span className="badge badge-critical">Critical</span>;
    } else if (daysUntilExpiry <= 30) {
      return <span className="badge badge-warning">Warning</span>;
    } else {
      return <span className="badge badge-normal">Active</span>;
    }
  };

  const getCategoryIcon = (category: string) => {
    const icons: { [key: string]: string } = {
      document: '📄',
      license: '🪪',
      insurance: '🛡️',
      warranty: '📋',
      subscription: '💳',
      medicine: '💊',
      food: '🍎',
      other: '📦',
    };
    return icons[category] || icons.other;
  };

  const stats = {
    total: items.length,
    expired: items.filter((item) => isPast(new Date(item.expiry_date))).length,
    critical: items.filter(
      (item) =>
        differenceInDays(new Date(item.expiry_date), new Date()) <= 7 &&
        !isPast(new Date(item.expiry_date))
    ).length,
    active: items.filter(
      (item) => differenceInDays(new Date(item.expiry_date), new Date()) > 7
    ).length,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Dashboard - ExpiryTrackr</title>
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-3xl">⏰</span>
                <h1 className="text-2xl font-bold text-primary-600">ExpiryTrackr</h1>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">{user?.email}</span>
                <button onClick={handleLogout} className="btn btn-secondary text-sm">
                  Logout
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="card">
              <h3 className="text-sm font-medium text-gray-500">Total Items</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.total}</p>
            </div>
            <div className="card">
              <h3 className="text-sm font-medium text-gray-500">Expired</h3>
              <p className="text-3xl font-bold text-red-600 mt-2">{stats.expired}</p>
            </div>
            <div className="card">
              <h3 className="text-sm font-medium text-gray-500">Critical (≤7 days)</h3>
              <p className="text-3xl font-bold text-orange-600 mt-2">{stats.critical}</p>
            </div>
            <div className="card">
              <h3 className="text-sm font-medium text-gray-500">Active</h3>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.active}</p>
            </div>
          </div>

          {/* Add Item Button */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Your Items</h2>
            <button
              onClick={() => setShowAddModal(true)}
              className="btn btn-primary"
            >
              + Add Item
            </button>
          </div>

          {/* Items List */}
          {items.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-gray-500 text-lg mb-4">No items tracked yet</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="btn btn-primary"
              >
                Add Your First Item
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((item) => (
                <div key={item.id} className="card hover:shadow-lg transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{getCategoryIcon(item.category)}</span>
                      <div>
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        <p className="text-xs text-gray-500 capitalize">{item.category}</p>
                      </div>
                    </div>
                    {getStatusBadge(item.expiry_date)}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Expires:</span>
                      <span className="font-medium text-gray-900">
                        {format(new Date(item.expiry_date), 'MMM dd, yyyy')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Time left:</span>
                      <span className="font-medium text-gray-900">
                        {formatDistanceToNow(new Date(item.expiry_date), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    {item.notes && (
                      <p className="text-gray-600 text-xs mt-2 border-t pt-2">
                        {item.notes}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t flex items-center justify-end space-x-2">
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Add Item Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Item</h2>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div>
                  <label className="label">Item Name</label>
                  <input
                    type="text"
                    required
                    className="input"
                    placeholder="e.g., Passport, Insurance Policy"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="label">Category</label>
                  <select
                    className="input"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  >
                    <option value="document">Document</option>
                    <option value="license">License</option>
                    <option value="insurance">Insurance</option>
                    <option value="warranty">Warranty</option>
                    <option value="subscription">Subscription</option>
                    <option value="medicine">Medicine</option>
                    <option value="food">Food</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="label">Expiry Date</label>
                  <input
                    type="date"
                    required
                    className="input"
                    value={newItem.expiry_date}
                    onChange={(e) =>
                      setNewItem({ ...newItem, expiry_date: e.target.value })
                    }
                  />
                </div>

                <div>
                  <label className="label">Remind me (days before)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    className="input"
                    value={newItem.reminder_days_before}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem,
                        reminder_days_before: parseInt(e.target.value),
                      })
                    }
                  />
                </div>

                <div>
                  <label className="label">Notes (optional)</label>
                  <textarea
                    className="input"
                    rows={3}
                    placeholder="Add any additional notes..."
                    value={newItem.notes}
                    onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                  />
                </div>

                <div className="flex items-center space-x-3 pt-4">
                  <button type="submit" className="btn btn-primary flex-1">
                    Add Item
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="btn btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
