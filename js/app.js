/**
 * SISTEMA DE PULPERÍA - Aplicación principal
 */

// ============================================
// UTILIDADES
// ============================================
const Utils = {
    formatCurrency(amount) {
        const settings = DB.getSettings();
        return settings.currency + parseFloat(amount || 0).toFixed(2);
    },
    formatDate(dateStr) {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hour = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hour}:${min}`;
    },
    formatDateShort(dateStr) {
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    },
    generateTicketNumber() {
        return 'T-' + Date.now().toString(36).toUpperCase();
    },
    todayString() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    },
    // Fecha inicio del mes
    monthStart() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-01';
    }
};

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, duration);
}

// ============================================
// NAVEGACIÓN
// ============================================
const Navigation = {
    currentSection: 'pos',

    init() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                this.navigate(item.dataset.section);
            });
        });
    },

    navigate(section) {
        this.currentSection = section;
        // Actualizar nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });
        // Mostrar sección
        document.querySelectorAll('.section').forEach(s => {
            s.classList.toggle('active', s.id === `section-${section}`);
        });
        // Actualizar título
        const titles = {
            pos: 'Punto de Venta',
            inventory: 'Inventario',
            credit: 'Fiado',
            consumption: 'Consumo',
            reports: 'Reportes',
            settings: 'Configuración'
        };
        document.getElementById('pageTitle').textContent = titles[section] || 'Pulpería';

        // Refresh data on navigate
        switch (section) {
            case 'pos': POS.init(); break;
            case 'inventory': Inventory.init(); break;
            case 'credit': Credit.init(); break;
            case 'consumption': Consumption.init(); break;
            case 'reports': Reports.init(); break;
            case 'settings': Settings.init(); break;
        }
    }
};

// ============================================
// PUNTO DE VENTA (POS)
// ============================================
const POS = {
    cart: [],
    saleType: 'cash', // 'cash', 'credit', 'consumption'
    selectedCustomer: null,
    weightedPendingId: null, // producto pendiente de ingresar peso

    init() {
        this.renderProducts();
        this.updateCart();
    },

    renderProducts(filter = '') {
        const container = document.getElementById('posProducts');
        const products = DB.getProducts();
        const searchTerm = filter.toLowerCase();

        const filtered = products.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.category.toLowerCase().includes(searchTerm)
        );

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📦</div>
                    <p>${filter ? 'No se encontraron productos' : 'No hay productos. Agrega productos en Inventario'}</p>
                </div>`;
            return;
        }

        container.innerHTML = filtered.map(p => {
            const inStock = p.stock > 0;
            const cartItem = this.cart.find(c => c.id === p.id);
            const qty = cartItem ? cartItem.qty : 0;
            const isConsumible = document.querySelector('#toggleSaleType .toggle-option.active')?.dataset?.value === 'consumption';

            return `
                <div class="product-card ${!inStock ? 'out-of-stock' : ''}" 
                     onclick="POS.addToCart('${p.id}')"
                     data-id="${p.id}">
                    <div class="product-name">${p.name}</div>
                    <div class="product-price">${Utils.formatCurrency(p.price)}</div>
                    <div class="product-stock ${p.stock <= 5 ? 'stock-low' : ''}">
                        ${inStock ? p.stock + (p.isWeighted ? ' lbs' : ' uds') : 'AGOTADO'}
                    </div>
                    ${qty > 0 ? `<span style="position:absolute;bottom:6px;right:6px;background:var(--primary);color:white;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700">${qty}</span>` : ''}
                    ${!p.fiado_permitido ? '<span class="badge badge-credit">No Fiado</span>' : ''}
                    ${p.isWeighted ? '<span class="badge badge-consumption">lb</span>' : ''}
                </div>`;
        }).join('');
    },

    addToCart(productId, customWeight = null) {
        const product = DB.getProduct(productId);
        if (!product) return;

        if (product.stock <= 0) {
            showToast('Producto agotado', 'error');
            return;
        }

        const saleType = document.querySelector('#toggleSaleType .toggle-option.active')?.dataset?.value || 'cash';

        // Verificar si el producto permite fiado
        if (saleType === 'credit' && !product.fiado_permitido) {
            showToast('Este producto no se puede vender fiado', 'warning');
            return;
        }

        // Si es producto por peso (libras) - mostrar modal
        if (product.isWeighted) {
            this.showWeightModal(productId);
            return;
        }

        // Producto por unidad (normal)
        const existing = this.cart.find(c => c.id === productId);
        if (existing) {
            if (existing.qty >= product.stock) {
                showToast('Stock insuficiente', 'error');
                return;
            }
            existing.qty += 1;
        } else {
            this.cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                qty: 1,
                maxStock: product.stock,
                isWeighted: false
            });
        }
        this.updateCart();
        this.renderProducts(document.getElementById('posSearch').value);
        showToast(`${product.name} agregado`, 'success', 1000);
    },

    removeFromCart(productId) {
        this.cart = this.cart.filter(c => c.id !== productId);
        this.updateCart();
        this.renderProducts(document.getElementById('posSearch').value);
    },

    updateQty(productId, delta) {
        const item = this.cart.find(c => c.id === productId);
        if (!item) return;

        const product = DB.getProduct(productId);
        item.qty += delta;

        if (item.qty <= 0) {
            this.removeFromCart(productId);
            return;
        }
        if (item.qty > product.stock) {
            item.qty = product.stock;
            showToast('Stock máximo alcanzado', 'warning');
        }
        this.updateCart();
    },

    getTotal() {
        return this.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    },

    getItemCount() {
        return this.cart.reduce((sum, item) => sum + item.qty, 0);
    },

    updateCart() {
        const container = document.getElementById('cartItems');
        const totalEl = document.getElementById('cartTotal');
        const countEl = document.getElementById('cartCount');
        const btnCheckout = document.getElementById('btnCheckout');

        const total = this.getTotal();
        const count = this.getItemCount();

        if (count === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <div class="empty-icon">🛒</div>
                    <p>Carrito vacío. Haz clic en los productos para agregarlos.</p>
                </div>`;
            totalEl.textContent = Utils.formatCurrency(0);
            countEl.textContent = '0';
            btnCheckout.disabled = true;
            btnCheckout.style.opacity = '0.5';
            return;
        }

        btnCheckout.disabled = false;
        btnCheckout.style.opacity = '1';
        countEl.textContent = count;

        container.innerHTML = this.cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-price">${Utils.formatCurrency(item.price)} c/u</div>
                </div>
                <div class="cart-item-qty">
                    <button class="qty-btn" onclick="POS.updateQty('${item.id}', -1)">−</button>
                    <span class="qty-value">${item.qty}</span>
                    <button class="qty-btn" onclick="POS.updateQty('${item.id}', 1)">+</button>
                </div>
                <div class="cart-item-total">${Utils.formatCurrency(item.price * item.qty)}</div>
                <button class="qty-btn" style="background:var(--danger);color:white;border:none;" onclick="POS.removeFromCart('${item.id}')">✕</button>
            </div>
        `).join('');

        totalEl.textContent = Utils.formatCurrency(total);
    },

    checkout() {
        const saleType = document.querySelector('#toggleSaleType .toggle-option.active')?.dataset?.value || 'cash';

        if (this.cart.length === 0) {
            showToast('Agrega productos al carrito', 'warning');
            return;
        }

        if (saleType === 'credit' && !this.selectedCustomer) {
            // Mostrar modal para seleccionar cliente
            this.showCreditCustomerSelector();
            return;
        }

        if (saleType === 'credit' && this.selectedCustomer) {
            this.finalizeCreditSale();
            return;
        }

        if (saleType === 'consumption') {
            this.finalizeConsumption();
            return;
        }

        // Venta normal (cash)
        this.finalizeCashSale();
    },

    showCreditCustomerSelector() {
        const modal = document.getElementById('creditCustomerModal');
        const container = document.getElementById('creditCustomerList');
        const customers = DB.getCreditCustomers();

        if (customers.length === 0) {
            showToast('No hay clientes de fiado. Regístralos primero en la sección Fiado.', 'warning');
            return;
        }

        container.innerHTML = customers.map(c => `
            <div class="customer-item" onclick="POS.selectCreditCustomer('${c.id}')">
                <div>
                    <div class="customer-name">${c.name}</div>
                    <div class="text-muted" style="font-size:0.8rem">${c.phone || 'Sin teléfono'}</div>
                </div>
                <div class="customer-balance balance-${c.balance > 50000 ? 'danger' : c.balance > 20000 ? 'warn' : 'ok'}">
                    ${Utils.formatCurrency(c.balance)}
                </div>
            </div>
        `).join('') || '<div class="empty-state"><p>No hay clientes registrados</p></div>';

        modal.classList.add('show');
    },

    selectCreditCustomer(customerId) {
        const customer = DB.getCreditCustomers().find(c => c.id === customerId);
        if (customer) {
            this.selectedCustomer = customer;
            document.getElementById('creditCustomerModal').classList.remove('show');
            showToast(`Cliente: ${customer.name} seleccionado`, 'success');
            // Mostrar badge con nombre del cliente
            document.getElementById('selectedCustomerBadge').innerHTML = `
                <span style="background:var(--warning);color:#000;padding:2px 8px;border-radius:10px;font-size:0.7rem;font-weight:600">
                    ${customer.name} ✕
                </span>`;
            document.getElementById('selectedCustomerBadge').onclick = () => {
                this.selectedCustomer = null;
                document.getElementById('selectedCustomerBadge').innerHTML = '';
            };
            this.finalizeCreditSale();
        }
    },

    finalizeCashSale() {
        try {
            const total = this.getTotal();
            const items = [...this.cart];
            
            // Reducir stock PRIMERO
            items.forEach(item => DB.reduceStock(item.id, item.qty));
            
            // Guardar la venta DESPUÉS
            const sale = DB.addSale({
                items: items,
                total: total,
                paymentType: 'cash',
                ticketNumber: Utils.generateTicketNumber()
            });
            
            // Verificar que se guardó
            const savedSales = DB.getSales();
            const found = savedSales.find(s => s.id === sale.id);
            
            this.cart = [];
            this.updateCart();
            this.renderProducts(document.getElementById('posSearch').value);
            
            if (found) {
                showToast(`Venta #${sale.ticketNumber} registrada - Total: ${Utils.formatCurrency(total)}`, 'success');
            } else {
                showToast('Error: La venta no se guardó correctamente', 'error');
            }
        } catch (err) {
            showToast('Error al procesar la venta: ' + err.message, 'error');
        }
    },

    finalizeCreditSale() {
        try {
            const total = this.getTotal();
            const items = [...this.cart];
            const customer = this.selectedCustomer;

            // Reducir stock PRIMERO
            items.forEach(item => DB.reduceStock(item.id, item.qty));
            
            // Guardar la venta
            const sale = DB.addSale({
                items: items,
                total: total,
                paymentType: 'credit',
                customerId: customer.id,
                customerName: customer.name,
                ticketNumber: Utils.generateTicketNumber()
            });

            // Actualizar saldo del cliente
            DB.updateCreditCustomer(customer.id, {
                balance: customer.balance + total
            });

            // Registrar transacción
            DB.addCreditTransaction({
                customerId: customer.id,
                type: 'purchase',
                amount: total,
                description: `Compra fiada - Ticket #${sale.ticketNumber}`,
                saleId: sale.id
            });

            this.cart = [];
            this.selectedCustomer = null;
            document.getElementById('selectedCustomerBadge').innerHTML = '';
            this.updateCart();
            this.renderProducts(document.getElementById('posSearch').value);
            showToast(`Venta fiada a ${customer.name} - Total: ${Utils.formatCurrency(total)}`, 'success');
        } catch (err) {
            showToast('Error al procesar venta fiado: ' + err.message, 'error');
        }
    },

    finalizeConsumption() {
        try {
            const total = this.getTotal();
            const items = [...this.cart];
            
            // Reducir stock PRIMERO
            items.forEach(item => DB.reduceStock(item.id, item.qty));
            
            // Guardar consumo
            const consumption = DB.addConsumption({
                items: items,
                total: total,
                description: 'Consumo personal',
                ticketNumber: 'C-' + Date.now().toString(36).toUpperCase()
            });
            
            this.cart = [];
            this.updateCart();
            this.renderProducts(document.getElementById('posSearch').value);
            showToast(`Consumo registrado - Total: ${Utils.formatCurrency(total)}`, 'success');
        } catch (err) {
            showToast('Error al registrar consumo: ' + err.message, 'error');
        }
    },

    closeCreditModal() {
        document.getElementById('creditCustomerModal').classList.remove('show');
    },

    // ------ MODAL DE PESO (productos por libra) ------
    showWeightModal(productId) {
        const product = DB.getProduct(productId);
        if (!product) return;

        this.weightedPendingId = productId;
        document.getElementById('weightProductId').value = productId;
        document.getElementById('weightProductName').textContent = product.name;
        document.getElementById('weightPrice').textContent = Utils.formatCurrency(product.price);
        document.getElementById('weightStock').textContent = product.stock.toFixed(2) + ' lbs';
        document.getElementById('weightInput').value = '';
        document.getElementById('weightInput').placeholder = '0.00';
        document.getElementById('weightPreview').style.display = 'none';
        document.getElementById('weightModalTitle').textContent = '⚖️ ' + product.name;
        document.getElementById('weightModal').classList.add('show');
        
        // Enfocar el input
        setTimeout(() => {
            document.getElementById('weightInput').focus();
        }, 300);
    },

    confirmWeight() {
        try {
            // Leer productId del hidden input para evitar problemas de contexto
            const productId = document.getElementById('weightProductId').value;
            if (!productId) {
                showToast('Error: No hay producto seleccionado', 'error');
                return;
            }
            
            const product = DB.getProduct(productId);
            if (!product) {
                showToast('Error: Producto no encontrado', 'error');
                return;
            }

            const weightInput = document.getElementById('weightInput');
            const weight = parseFloat(weightInput ? weightInput.value : '0');
            
            if (isNaN(weight) || weight <= 0) {
                showToast('Ingresa un peso válido mayor a 0', 'error');
                weightInput.focus();
                weightInput.select();
                return;
            }
            if (weight > product.stock) {
                showToast(`Stock insuficiente. Disponible: ${product.stock.toFixed(2)} lbs`, 'error');
                return;
            }

            // Agregar al carrito
            const existing = this.cart.find(c => c.id === productId);
            const roundedWeight = Math.round(weight * 100) / 100;
            
            if (existing) {
                const newQty = existing.qty + roundedWeight;
                if (newQty > product.stock) {
                    showToast(`Stock insuficiente. Disponible: ${product.stock.toFixed(2)} lbs`, 'error');
                    return;
                }
                existing.qty = Math.round(newQty * 100) / 100;
            } else {
                this.cart.push({
                    id: product.id,
                    name: product.name,
                    price: product.price,
                    qty: roundedWeight,
                    maxStock: product.stock,
                    isWeighted: true
                });
            }

            this.closeWeightModal();
            this.updateCart();
            this.renderProducts(document.getElementById('posSearch').value);
            showToast(`✅ ${product.name}: ${roundedWeight.toFixed(2)} lbs agregado - Total: ${Utils.formatCurrency(product.price * roundedWeight)}`, 'success', 2000);
        } catch (err) {
            showToast('Error al agregar producto: ' + err.message, 'error');
            console.error('confirmWeight error:', err);
        }
    },

    closeWeightModal() {
        document.getElementById('weightModal').classList.remove('show');
        this.weightedPendingId = null;
    },

    scanBarcode() {
        // Escanear código de barras desde el POS
        if (!('BarcodeDetector' in window)) {
            // Si no hay soporte nativo, usar input de imagen
            this.scanBarcodeWithCamera();
            return;
        }

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            showToast('Apuntale al código de barras del producto', 'info', 5000);
            const barcodeDetector = new BarcodeDetector({ 
                formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] 
            });
            
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    const video = document.createElement('video');
                    video.srcObject = stream;
                    video.setAttribute('playsinline', '');
                    video.style.position = 'fixed';
                    video.style.top = '0';
                    video.style.left = '0';
                    video.style.width = '100%';
                    video.style.height = '100%';
                    video.style.objectFit = 'cover';
                    video.style.zIndex = '2000';
                    video.style.background = '#000';
                    document.body.appendChild(video);
                    video.play();

                    const closeBtn = document.createElement('button');
                    closeBtn.textContent = '✕ Cancelar';
                    closeBtn.style.position = 'fixed';
                    closeBtn.style.bottom = '20px';
                    closeBtn.style.left = '50%';
                    closeBtn.style.transform = 'translateX(-50%)';
                    closeBtn.style.zIndex = '2001';
                    closeBtn.style.padding = '12px 24px';
                    closeBtn.style.background = 'var(--danger)';
                    closeBtn.style.color = 'white';
                    closeBtn.style.border = 'none';
                    closeBtn.style.borderRadius = '8px';
                    closeBtn.style.fontSize = '1rem';
                    closeBtn.style.fontWeight = '600';
                    document.body.appendChild(closeBtn);

                    const scanInterval = setInterval(() => {
                        barcodeDetector.detect(video)
                            .then(codes => {
                                if (codes.length > 0) {
                                    const barcode = codes[0].rawValue;
                                    clearInterval(scanInterval);
                                    stream.getTracks().forEach(track => track.stop());
                                    video.remove();
                                    closeBtn.remove();
                                    
                                    // Buscar producto con ese código
                                    const found = DB.getProducts().find(p => p.barcode === barcode);
                                    if (found) {
                                        this.addToCart(found.id);
                                        showToast(`Producto: ${found.name} - ₡${found.price}`, 'success');
                                    } else {
                                        showToast(`Código ${barcode} no encontrado en inventario`, 'warning');
                                        document.getElementById('posSearch').value = barcode;
                                        this.renderProducts(barcode);
                                    }
                                }
                            })
                            .catch(() => {});
                    }, 500);

                    closeBtn.onclick = () => {
                        clearInterval(scanInterval);
                        stream.getTracks().forEach(track => track.stop());
                        video.remove();
                        closeBtn.remove();
                    };

                    // Auto detener después de 30s
                    setTimeout(() => {
                        clearInterval(scanInterval);
                        if (stream.active) {
                            stream.getTracks().forEach(track => track.stop());
                        }
                        if (video.parentNode) video.remove();
                        if (closeBtn.parentNode) closeBtn.remove();
                    }, 30000);
                })
                .catch(() => {
                    showToast('No se pudo acceder a la cámara', 'warning');
                    this.scanBarcodeWithCamera();
                });
        } else {
            this.scanBarcodeWithCamera();
        }
    },

    scanBarcodeWithCamera() {
        // Usar input file con cámara
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                if ('BarcodeDetector' in window) {
                    try {
                        const bitmap = await createImageBitmap(file);
                        const detector = new BarcodeDetector({ 
                            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] 
                        });
                        const codes = await detector.detect(bitmap);
                        if (codes.length > 0) {
                            const barcode = codes[0].rawValue;
                            const found = DB.getProducts().find(p => p.barcode === barcode);
                            if (found) {
                                this.addToCart(found.id);
                                showToast(`Producto: ${found.name} - ₡${found.price}`, 'success');
                            } else {
                                showToast(`Código ${barcode} no encontrado`, 'warning');
                                document.getElementById('posSearch').value = barcode;
                                this.renderProducts(barcode);
                            }
                        } else {
                            showToast('No se detectó código de barras', 'warning');
                        }
                    } catch (err) {
                        showToast('Error al leer código de barras', 'error');
                    }
                } else {
                    showToast('Toma una foto clara del código de barras', 'info', 3000);
                }
            };
            
            input.click();
        } catch (err) {
            showToast('Error al acceder a la cámara', 'error');
        }
    }
};

// ============================================
// INVENTARIO
// ============================================
const Inventory = {
    editingId: null,

    init() {
        this.renderProducts();
    },

    renderProducts(filter = '') {
        const tableBody = document.getElementById('inventoryTableBody');
        const products = DB.getProducts();
        const searchTerm = filter.toLowerCase();

        const filtered = products.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.category.toLowerCase().includes(searchTerm)
        );

        if (filtered.length === 0) {
            tableBody.innerHTML = `
                <tr><td colspan="6" class="text-center text-muted" style="padding:20px">
                    ${filter ? 'No se encontraron productos' : 'No hay productos registrados'}
                </td></tr>`;
            return;
        }

        tableBody.innerHTML = filtered.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>${Utils.formatCurrency(p.price)}</td>
                <td>${Utils.formatCurrency(p.costPrice || 0)}</td>
                <td class="${p.stock <= 5 ? 'text-danger' : ''}">
                    ${p.stock} ${p.stock <= 0 ? '🚫' : p.stock <= 5 ? '⚠️' : ''}
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline" onclick="Inventory.editProduct('${p.id}')">✏️</button>
                        <button class="btn btn-sm btn-danger" onclick="Inventory.deleteProduct('${p.id}')">🗑️</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    showAddForm() {
        this.editingId = null;
        document.getElementById('modalTitle').textContent = 'Agregar Producto';
        document.getElementById('productForm').reset();
        document.getElementById('productId').value = '';
        document.getElementById('productModal').classList.add('show');
    },

    editProduct(id) {
        const p = DB.getProduct(id);
        if (!p) return;
        this.editingId = id;
        document.getElementById('modalTitle').textContent = 'Editar Producto';
        document.getElementById('productId').value = id;
        document.getElementById('productName').value = p.name;
        document.getElementById('productCategory').value = p.category || '';
        document.getElementById('productBarcode').value = p.barcode || '';
        document.getElementById('productPrice').value = p.price;
        document.getElementById('productCost').value = p.costPrice || '';
        document.getElementById('productStock').value = p.stock;
        document.getElementById('productSaleType').value = p.isWeighted ? 'weight' : 'unit';
        document.getElementById('productFiado').checked = p.fiado_permitido !== false;
        document.getElementById('productModal').classList.add('show');
    },

    saveProduct() {
        const name = document.getElementById('productName').value.trim();
        const category = document.getElementById('productCategory').value.trim();
        const barcode = document.getElementById('productBarcode').value.trim();
        const price = parseFloat(document.getElementById('productPrice').value);
        const costPrice = parseFloat(document.getElementById('productCost').value) || 0;
        const stock = parseFloat(document.getElementById('productStock').value);
        const isWeighted = document.getElementById('productSaleType').value === 'weight';
        const fiadoPermitido = document.getElementById('productFiado').checked;

        // Validaciones
        if (!name) { showToast('El nombre del producto es obligatorio', 'error'); return; }
        if (isNaN(price) || price <= 0) { showToast('Precio inválido', 'error'); return; }
        if (isNaN(stock) || stock < 0) { showToast('Stock inválido', 'error'); return; }

        const productData = { name, category, barcode, price, costPrice, stock, isWeighted, fiado_permitido: fiadoPermitido };

        // Verificar código de barras único
        if (barcode) {
            const existing = DB.getProducts().find(p =>
                p.barcode === barcode && p.id !== this.editingId
            );
            if (existing) {
                showToast(`El código de barras ya está asignado a "${existing.name}"`, 'error');
                return;
            }
        }

        if (this.editingId) {
            DB.updateProduct(this.editingId, productData);
            showToast('Producto actualizado', 'success');
        } else {
            DB.addProduct(productData);
            showToast('Producto agregado', 'success');
        }

        this.closeForm();
        this.renderProducts(document.getElementById('inventorySearch').value);
        POS.renderProducts();
    },

    startBarcodeScan() {
        // Usar la API de cámara para escanear
        if (!('BarcodeDetector' in window)) {
            // Si no hay soporte nativo, pedir que ingrese manualmente con enfoque en el input
            showToast('Escanea con la cámara o escribe el código manualmente', 'info', 3000);
            // Intentar usar la cámara para escanear con librería ZXing
            this.scanWithCamera();
            return;
        }

        const barcodeInput = document.getElementById('productBarcode');
        // El navegador soporta BarcodeDetector nativo (Chrome Android)
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            showToast('Apuntale al código de barras con la cámara', 'info', 5000);
            const barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
            
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
                .then(stream => {
                    const video = document.createElement('video');
                    video.srcObject = stream;
                    video.setAttribute('playsinline', '');
                    video.play();

                    const scanInterval = setInterval(() => {
                        barcodeDetector.detect(video)
                            .then(codes => {
                                if (codes.length > 0) {
                                    barcodeInput.value = codes[0].rawValue;
                                    clearInterval(scanInterval);
                                    stream.getTracks().forEach(track => track.stop());
                                    video.remove();
                                    showToast('Código escaneado: ' + codes[0].rawValue, 'success');
                                    // Buscar producto con ese código
                                    const found = DB.getProducts().find(p => p.barcode === codes[0].rawValue);
                                    if (found) {
                                        showToast(`Producto encontrado: ${found.name}`, 'success');
                                    }
                                }
                            })
                            .catch(() => {});
                    }, 500);

                    // Detener después de 30 segundos
                    setTimeout(() => {
                        clearInterval(scanInterval);
                        stream.getTracks().forEach(track => track.stop());
                        video.remove();
                    }, 30000);
                })
                .catch(() => {
                    // No se pudo acceder a la cámara
                    showToast('No se pudo acceder a la cámara. Ingresa el código manualmente.', 'warning');
                    barcodeInput.focus();
                });
        }
    },

    scanWithCamera() {
        // Intentar usar el input de tipo file para capturar imagen y procesar
        showToast('Usa la cámara para capturar el código de barras', 'info', 3000);
        
        try {
            // Crear un input para capturar imagen
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.capture = 'environment';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                
                // Intentar decodificar con la API nativa si está disponible
                if ('BarcodeDetector' in window) {
                    const bitmap = await createImageBitmap(file);
                    const detector = new BarcodeDetector({ 
                        formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr'] 
                    });
                    try {
                        const codes = await detector.detect(bitmap);
                        if (codes.length > 0) {
                            document.getElementById('productBarcode').value = codes[0].rawValue;
                            showToast('Código detectado: ' + codes[0].rawValue, 'success');
                        } else {
                            showToast('No se detectó código de barras en la imagen', 'warning');
                        }
                    } catch (err) {
                        showToast('Error al leer código de barras', 'error');
                    }
                } else {
                    showToast('Tu navegador no soporta detección. Escribe el código manualmente.', 'warning');
                    document.getElementById('productBarcode').focus();
                }
            };
            
            input.click();
        } catch (err) {
            showToast('Error al acceder a la cámara', 'error');
            document.getElementById('productBarcode').focus();
        }
    },

    closeForm() {
        document.getElementById('productModal').classList.remove('show');
    },

    deleteProduct(id) {
        if (confirm('¿Eliminar este producto?')) {
            DB.deleteProduct(id);
            this.renderProducts(document.getElementById('inventorySearch').value);
            POS.renderProducts();
            showToast('Producto eliminado', 'success');
        }
    }
};

// ============================================
// FIADO (CRÉDITO)
// ============================================
const Credit = {
    init() {
        this.renderCustomers();
        this.renderHistory();
    },

    renderCustomers(filter = '') {
        const container = document.getElementById('customerList');
        const customers = DB.getCreditCustomers();
        const searchTerm = filter.toLowerCase();

        const filtered = customers.filter(c =>
            c.name.toLowerCase().includes(searchTerm) ||
            (c.phone && c.phone.includes(filter))
        );

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">👤</div>
                    <p>${filter ? 'No se encontraron clientes' : 'No hay clientes de fiado aún'}</p>
                </div>`;
            return;
        }

        container.innerHTML = filtered.map(c => `
            <div class="customer-item" onclick="Credit.showCustomerDetail('${c.id}')">
                <div>
                    <div class="customer-name">${c.name}</div>
                    <div class="text-muted" style="font-size:0.8rem">${c.phone || '—'}</div>
                </div>
                <div class="customer-balance balance-${c.balance > 50000 ? 'danger' : c.balance > 20000 ? 'warn' : 'ok'}">
                    ${Utils.formatCurrency(c.balance)}
                </div>
            </div>
        `).join('');
    },

    showAddCustomerForm() {
        document.getElementById('customerForm').reset();
        document.getElementById('customerFormModal').classList.add('show');
    },

    saveCustomer() {
        const name = document.getElementById('customerName').value.trim();
        const phone = document.getElementById('customerPhone').value.trim();
        const notes = document.getElementById('customerNotes').value.trim();

        if (!name) { showToast('El nombre es obligatorio', 'error'); return; }

        DB.addCreditCustomer({ name, phone, notes });
        this.renderCustomers(document.getElementById('creditSearch').value);
        document.getElementById('customerFormModal').classList.remove('show');
        showToast(`Cliente ${name} registrado`, 'success');
    },

    closeCustomerForm() {
        document.getElementById('customerFormModal').classList.remove('show');
    },

    showCustomerDetail(customerId) {
        const customer = DB.getCreditCustomers().find(c => c.id === customerId);
        if (!customer) return;

        const transactions = DB.getCustomerTransactions(customerId);

        // Info del cliente
        document.getElementById('detailCustomerName').textContent = customer.name;
        document.getElementById('detailCustomerPhone').textContent = customer.phone || 'Sin teléfono';
        document.getElementById('detailCustomerBalance').textContent = Utils.formatCurrency(customer.balance);
        document.getElementById('detailCustomerBalance').className = `customer-balance balance-${customer.balance > 50000 ? 'danger' : customer.balance > 20000 ? 'warn' : 'ok'}`;
        document.getElementById('detailCustomerNotes').textContent = customer.notes || 'Sin notas';

        // Historial de transacciones
        const historyContainer = document.getElementById('customerTransactions');
        if (transactions.length === 0) {
            historyContainer.innerHTML = '<div class="empty-state"><p>Sin movimientos</p></div>';
        } else {
            historyContainer.innerHTML = transactions.slice().reverse().map(t => `
                <div class="consumption-item">
                    <div>
                        <div style="font-size:0.85rem">${t.description}</div>
                        <div class="text-muted" style="font-size:0.7rem">${Utils.formatDate(t.date)}</div>
                    </div>
                    <div class="${t.type === 'payment' ? 'text-success' : 'text-danger'}" style="font-weight:600">
                        ${t.type === 'payment' ? '-' : '+'} ${Utils.formatCurrency(t.amount)}
                    </div>
                </div>
            `).join('');
        }

        // Botón para abonar
        document.getElementById('btnMakePayment').onclick = () => {
            const amount = prompt('Monto a abonar:', '');
            if (amount === null) return;
            const payAmount = parseFloat(amount);
            if (isNaN(payAmount) || payAmount <= 0) {
                showToast('Monto inválido', 'error');
                return;
            }
            if (payAmount > customer.balance) {
                showToast('El abono no puede exceder la deuda', 'warning');
                return;
            }
            // Registrar pago
            DB.updateCreditCustomer(customer.id, { balance: customer.balance - payAmount });
            DB.addCreditTransaction({
                customerId: customer.id,
                type: 'payment',
                amount: payAmount,
                description: `Abono de ${Utils.formatCurrency(payAmount)}`
            });
            showToast(`Abono de ${Utils.formatCurrency(payAmount)} registrado`, 'success');
            // Recargar detalle
            this.showCustomerDetail(customer.id);
            this.renderCustomers(document.getElementById('creditSearch').value);
        };

        document.getElementById('customerDetailModal').classList.add('show');
    },

    closeCustomerDetail() {
        document.getElementById('customerDetailModal').classList.remove('show');
    },

    showTab(tabName) {
        document.querySelectorAll('#section-credit .tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`#section-credit .tab[data-tab="${tabName}"]`).classList.add('active');
        document.querySelectorAll('#section-credit .tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
        if (tabName === 'history') {
            this.renderHistory(document.getElementById('creditHistorySearch').value);
        } else {
            this.renderCustomers(document.getElementById('creditSearch').value);
        }
    },

    renderHistory(filter = '') {
        const container = document.getElementById('creditHistoryList');
        const transactions = DB.getCreditTransactions();
        const customers = DB.getCreditCustomers();

        const searchTerm = filter.toLowerCase();
        const filtered = transactions.filter(t => {
            const customer = customers.find(c => c.id === t.customerId);
            return !searchTerm || (customer && customer.name.toLowerCase().includes(searchTerm));
        });

        // Últimas 50 transacciones
        const recent = filtered.slice().reverse().slice(0, 50);

        if (recent.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Sin movimientos recientes</p></div>';
            return;
        }

        container.innerHTML = recent.map(t => {
            const customer = customers.find(c => c.id === t.customerId);
            return `
                <div class="consumption-item">
                    <div>
                        <div style="font-size:0.85rem">
                            ${customer ? `<strong>${customer.name}</strong>` : 'Cliente eliminado'}
                        </div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">${t.description}</div>
                        <div class="text-muted" style="font-size:0.7rem">${Utils.formatDate(t.date)}</div>
                    </div>
                    <div class="${t.type === 'payment' ? 'text-success' : 'text-danger'}" style="font-weight:600">
                        ${t.type === 'payment' ? '-' : '+'} ${Utils.formatCurrency(t.amount)}
                    </div>
                </div>
            `;
        }).join('');
    }
};

// ============================================
// CONSUMO PERSONAL
// ============================================
const Consumption = {
    init() {
        this.renderToday();
    },

    renderToday() {
        const container = document.getElementById('consumptionList');
        const consumptions = DB.getConsumptions();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayConsumptions = consumptions.filter(c => new Date(c.date) >= today);

        if (todayConsumptions.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Sin consumos hoy</p></div>';
            return;
        }

        container.innerHTML = todayConsumptions.slice().reverse().map(c => `
            <div class="consumption-item">
                <div>
                    <div style="font-size:0.85rem">
                        ${c.description || 'Consumo'}
                        <span style="font-size:0.7rem;color:var(--text-muted)">#${c.ticketNumber}</span>
                    </div>
                    <div class="text-muted" style="font-size:0.7rem">${Utils.formatDate(c.date)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">
                        ${c.items.map(i => `${i.name} x${i.qty}`).join(', ')}
                    </div>
                </div>
                <div class="text-warning" style="font-weight:600">${Utils.formatCurrency(c.total)}</div>
            </div>
        `).join('');
    },

    renderHistory(filter = '') {
        const container = document.getElementById('consumptionHistoryList');
        const consumptions = DB.getConsumptions();
        const searchTerm = filter.toLowerCase();

        const filtered = consumptions.filter(c =>
            !searchTerm ||
            (c.description && c.description.toLowerCase().includes(searchTerm)) ||
            (c.ticketNumber && c.ticketNumber.toLowerCase().includes(searchTerm))
        );

        const recent = filtered.slice().reverse().slice(0, 100);

        if (recent.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Sin consumos registrados</p></div>';
            return;
        }

        // Calcular total del período
        const totalConsumption = filtered.reduce((sum, c) => sum + c.total, 0);
        document.getElementById('consumptionTotal').textContent = Utils.formatCurrency(totalConsumption);

        container.innerHTML = recent.map(c => `
            <div class="consumption-item">
                <div>
                    <div style="font-size:0.85rem">
                        ${c.description || 'Consumo'}
                        <span style="font-size:0.7rem;color:var(--text-muted)">#${c.ticketNumber}</span>
                    </div>
                    <div class="text-muted" style="font-size:0.7rem">${Utils.formatDate(c.date)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">
                        ${c.items.map(i => `${i.name} x${i.qty}`).join(', ')}
                    </div>
                </div>
                <div class="text-warning" style="font-weight:600">${Utils.formatCurrency(c.total)}</div>
            </div>
        `).join('');
    }
};

// ============================================
// REPORTES
// ============================================
const Reports = {
    init() {
        const today = Utils.todayString();
        document.getElementById('reportStartDate').value = Utils.monthStart();
        document.getElementById('reportEndDate').value = today;
        this.render();
    },

    render() {
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;

        if (!startDate || !endDate) return;

        // Ventas del período
        const sales = DB.getSalesByDateRange(startDate, endDate);
        const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
        const salesCount = sales.length;

        // Ventas de contado vs fiado
        const cashSales = sales.filter(s => s.paymentType === 'cash');
        const creditSales = sales.filter(s => s.paymentType === 'credit');

        const totalCash = cashSales.reduce((sum, s) => sum + s.total, 0);
        const totalCredit = creditSales.reduce((sum, s) => sum + s.total, 0);

        // Consumo del período
        const totalConsumption = DB.getTotalConsumptionByDateRange(startDate, endDate);

        // Cobros realizados (pagos de fiado)
        const allTransactions = DB.getCreditTransactions();
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        const paymentsInPeriod = allTransactions.filter(t =>
            t.type === 'payment' &&
            new Date(t.date) >= start &&
            new Date(t.date) <= end
        );
        const totalPayments = paymentsInPeriod.reduce((sum, t) => sum + t.amount, 0);

        // Actualizar stats
        document.getElementById('statSalesTotal').textContent = Utils.formatCurrency(totalSales);
        document.getElementById('statSalesCount').textContent = salesCount;
        document.getElementById('statCashTotal').textContent = Utils.formatCurrency(totalCash);
        document.getElementById('statCreditTotal').textContent = Utils.formatCurrency(totalCredit);
        document.getElementById('statPayments').textContent = Utils.formatCurrency(totalPayments);
        document.getElementById('statConsumption').textContent = Utils.formatCurrency(totalConsumption);

        // Productos más vendidos
        const productSales = {};
        sales.forEach(s => {
            s.items.forEach(item => {
                if (!productSales[item.name]) productSales[item.name] = 0;
                productSales[item.name] += item.qty;
            });
        });

        const sortedProducts = Object.entries(productSales)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const topProductsContainer = document.getElementById('topProducts');
        if (sortedProducts.length === 0) {
            topProductsContainer.innerHTML = '<div class="empty-state"><p>Sin ventas en el período</p></div>';
        } else {
            topProductsContainer.innerHTML = sortedProducts.map(([name, qty], i) => `
                <div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
                    <span>${i + 1}. ${name}</span>
                    <span style="font-weight:600;color:var(--primary)">${qty} uds</span>
                </div>
            `).join('');
        }

        // Ventas recientes
        const recentSalesContainer = document.getElementById('recentSales');
        const recentSales = sales.slice().reverse().slice(0, 20);

        if (recentSales.length === 0) {
            recentSalesContainer.innerHTML = '<div class="empty-state"><p>Sin ventas en el período</p></div>';
        } else {
            recentSalesContainer.innerHTML = recentSales.map(s => `
                <div class="consumption-item">
                    <div>
                        <div style="font-size:0.85rem">
                            <strong>#${s.ticketNumber}</strong>
                            <span class="${s.paymentType === 'credit' ? 'text-warning' : 'text-success'}" style="font-size:0.7rem">
                                (${s.paymentType === 'credit' ? 'Fiado' : s.paymentType === 'consumption' ? 'Consumo' : 'Contado'})
                            </span>
                            ${s.customerName ? `<span style="font-size:0.75rem">- ${s.customerName}</span>` : ''}
                        </div>
                        <div class="text-muted" style="font-size:0.7rem">${Utils.formatDate(s.date)}</div>
                        <div style="font-size:0.75rem;color:var(--text-muted)">
                            ${s.items.map(i => `${i.name} x${i.qty}`).join(', ')}
                        </div>
                    </div>
                    <div style="font-weight:600;color:var(--secondary)">${Utils.formatCurrency(s.total)}</div>
                </div>
            `).join('');
        }

        // Clientes con deudas
        const customers = DB.getCreditCustomers();
        const debtorsContainer = document.getElementById('debtorsList');
        const debtors = customers.filter(c => c.balance > 0).sort((a, b) => b.balance - a.balance);

        if (debtors.length === 0) {
            debtorsContainer.innerHTML = '<div class="empty-state"><p>Sin deudas pendientes</p></div>';
        } else {
            const totalDebt = debtors.reduce((sum, c) => sum + c.balance, 0);
            document.getElementById('totalDebt').textContent = Utils.formatCurrency(totalDebt);

            debtorsContainer.innerHTML = debtors.map(c => `
                <div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
                    <span>${c.name}</span>
                    <span class="text-danger" style="font-weight:600">${Utils.formatCurrency(c.balance)}</span>
                </div>
            `).join('');
        }

        // Ganancia estimada (precio venta - precio costo)
        let totalCost = 0;
        sales.forEach(s => {
            s.items.forEach(item => {
                const product = DB.getProduct(item.id);
                if (product && product.costPrice) {
                    totalCost += product.costPrice * item.qty;
                }
            });
        });
        const estimatedProfit = totalSales - totalCost;
        document.getElementById('estimatedProfit').textContent = Utils.formatCurrency(estimatedProfit);
        document.getElementById('estimatedProfit').style.color = estimatedProfit >= 0 ? 'var(--secondary)' : 'var(--danger)';
    }
};

// ============================================
// CONFIGURACIÓN
// ============================================
const Settings = {
    init() {
        const settings = DB.getSettings();
        document.getElementById('storeName').value = settings.storeName || 'Mi Pulpería';
        document.getElementById('storeCurrency').value = settings.currency || '₡';
        document.getElementById('taxRate').value = settings.taxRate || 0;
    },

    save() {
        const storeName = document.getElementById('storeName').value.trim();
        const currency = document.getElementById('storeCurrency').value.trim();
        const taxRate = parseFloat(document.getElementById('taxRate').value) || 0;

        if (!storeName) { showToast('El nombre de la tienda es obligatorio', 'error'); return; }

        DB.saveSettings({ storeName, currency, taxRate });
        document.getElementById('pageTitle').textContent = storeName;
        showToast('Configuración guardada', 'success');
    },

    exportData() {
        try {
            const data = {
                products: DB.getProducts(),
                sales: DB.getSales(),
                creditCustomers: DB.getCreditCustomers(),
                creditTransactions: DB.getCreditTransactions(),
                consumption: DB.getConsumptions(),
                settings: DB.getSettings(),
                exportedAt: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pulperia-backup-${Utils.todayString()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Datos exportados exitosamente', 'success');
        } catch (e) {
            showToast('Error al exportar datos', 'error');
        }
    },

    importData() {
        const input = document.getElementById('importFile');
        const file = input.files[0];
        if (!file) { showToast('Selecciona un archivo', 'warning'); return; }

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.products) DB.saveProducts(data.products);
                if (data.sales) DB.saveSales(data.sales);
                if (data.creditCustomers) DB.saveCreditCustomers(data.creditCustomers);
                if (data.creditTransactions) DB.saveCreditTransactions(data.creditTransactions);
                if (data.consumption) DB.saveConsumptions(data.consumption);
                if (data.settings) DB.saveSettings(data.settings);
                showToast('Datos importados exitosamente', 'success');
                Navigation.navigate(Navigation.currentSection);
            } catch (err) {
                showToast('Archivo inválido', 'error');
            }
        };
        reader.readAsText(file);
    },

    clearAllData() {
        if (confirm('¿Estás seguro? Esta acción eliminará TODOS los datos (productos, ventas, clientes, etc.)')) {
            if (confirm('¿Realmente quieres borrar todo? No hay vuelta atrás.')) {
                localStorage.clear();
                showToast('Todos los datos han sido eliminados', 'warning');
                Navigation.navigate('pos');
            }
        }
    }
};

// ============================================
// INICIALIZACIÓN
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar navegación
    Navigation.init();

    // Mostrar sección inicial
    Navigation.navigate('pos');

    // --- EVENTOS ---

    // Búsqueda en POS
    document.getElementById('posSearch').addEventListener('input', function() {
        POS.renderProducts(this.value);
    });

    // Tipo de venta (toggle)
    document.querySelectorAll('#toggleSaleType .toggle-option').forEach(opt => {
        opt.addEventListener('click', function() {
            document.querySelectorAll('#toggleSaleType .toggle-option').forEach(o => o.classList.remove('active'));
            this.classList.add('active');
            // Si es consumo, navegar a la sección de consumo
            if (this.dataset.value === 'consumption') {
                POS.selectedCustomer = null;
                document.getElementById('selectedCustomerBadge').innerHTML = '';
            }
            if (this.dataset.value === 'credit') {
                // Si hay cliente seleccionado, mantenerlo
            } else {
                POS.selectedCustomer = null;
                document.getElementById('selectedCustomerBadge').innerHTML = '';
            }
        });
    });

    // Botón checkout
    document.getElementById('btnCheckout').addEventListener('click', function() {
        POS.checkout();
    });

    // Búsqueda en inventario
    document.getElementById('inventorySearch').addEventListener('input', function() {
        Inventory.renderProducts(this.value);
    });

    // Búsqueda en fiado (clientes)
    document.getElementById('creditSearch').addEventListener('input', function() {
        Credit.renderCustomers(this.value);
    });

    // Búsqueda en historial de fiado
    document.getElementById('creditHistorySearch').addEventListener('input', function() {
        Credit.renderHistory(this.value);
    });

    // Reportes - cambiar fecha
    document.getElementById('reportStartDate').addEventListener('change', function() {
        Reports.render();
    });
    document.getElementById('reportEndDate').addEventListener('change', function() {
        Reports.render();
    });

    // Tabs en sección consumo (historial)
    document.querySelectorAll('#section-consumption .tabs .tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('#section-consumption .tabs .tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            const tabName = this.dataset.tab;
            document.querySelectorAll('#section-consumption .tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabName}`).classList.add('active');
            if (tabName === 'history') {
                Consumption.renderHistory(document.getElementById('consumptionHistorySearch').value);
            } else {
                Consumption.renderToday();
            }
        });
    });

    // Búsqueda en historial consumo
    document.getElementById('consumptionHistorySearch').addEventListener('input', function() {
        Consumption.renderHistory(this.value);
    });

    // Modal product - guardar
    document.getElementById('btnSaveProduct').addEventListener('click', function() {
        Inventory.saveProduct();
    });

    // Modal product - cancelar
    document.getElementById('btnCancelProduct').addEventListener('click', function() {
        Inventory.closeForm();
    });

    // Modal customer - guardar
    document.getElementById('btnSaveCustomer').addEventListener('click', function() {
        Credit.saveCustomer();
    });

    // Modal customer - cancelar
    document.getElementById('btnCancelCustomer').addEventListener('click', function() {
        Credit.closeCustomerForm();
    });

    // Modal detail - cerrar
    document.getElementById('btnCloseDetail').addEventListener('click', function() {
        Credit.closeCustomerDetail();
    });

    // Modal credit customers - cerrar
    document.getElementById('btnCloseCreditCustomer').addEventListener('click', function() {
        POS.closeCreditModal();
    });

    // Modal peso - confirmar
    document.getElementById('btnConfirmWeight').addEventListener('click', function() {
        POS.confirmWeight();
    });

    // Modal peso - preview en tiempo real
    document.getElementById('weightInput').addEventListener('input', function() {
        const weight = parseFloat(this.value);
        if (!isNaN(weight) && weight > 0) {
            const productId = document.getElementById('weightProductId').value;
            const product = DB.getProduct(productId);
            if (product) {
                const total = product.price * weight;
                document.getElementById('weightTotalPreview').textContent = Utils.formatCurrency(total);
                document.getElementById('weightPreview').style.display = 'block';
                return;
            }
        }
        document.getElementById('weightPreview').style.display = 'none';
    });

    // Modal peso - Enter para confirmar
    document.getElementById('weightInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            POS.confirmWeight();
        }
    });

    // Configuración - guardar
    document.getElementById('btnSaveSettings').addEventListener('click', function() {
        Settings.save();
    });

    // Configuración - exportar
    document.getElementById('btnExportData').addEventListener('click', function() {
        Settings.exportData();
    });

    // Configuración - importar
    document.getElementById('btnImportData').addEventListener('click', function() {
        document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', function() {
        Settings.importData();
    });

    // Configuración - limpiar datos
    document.getElementById('btnClearData').addEventListener('click', function() {
        Settings.clearAllData();
    });

    // Cerrar modales con clic fuera
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.classList.remove('show');
            }
        });
    });

    // Tecla Escape para cerrar modales
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
        }
    });

    console.log('✅ Sistema de Pulpería iniciado');
});
