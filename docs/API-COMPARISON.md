# WebSocket API Comparison: Python Matter Server vs Matter.js Server

This document compares the WebSocket API functionality between the original Python Matter Server and this Matter.js-based implementation.

## Summary

| Category | Python Server | Matter.js Server | Coverage |
|----------|--------------|------------------|----------|
| Commands | 26 | 23 implemented | ~88% |
| Events | 9 | 6 | ~67% |
| Full functionality | - | - | ~80% |

---

## Command Comparison

### Legend
- ✅ Fully implemented
- ⚠️ Partially implemented / stubbed
- ❌ Not implemented

### Commissioning Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `commission_with_code` | ✅ | ✅ | Both support QR and manual pairing codes |
| `commission_on_network` | ✅ | ❌ | Commission via setup PIN without pairing code |
| `open_commissioning_window` | ✅ | ✅ | Open window for multi-fabric commissioning |
| `discover` | ✅ | ✅ | As `discover_commissionable_nodes` |

### Network Credential Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `set_wifi_credentials` | ✅ | ✅ | Store WiFi for BLE commissioning |
| `set_thread_dataset` | ✅ | ✅ | Store Thread dataset for commissioning |

### Node Management Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `start_listening` | ✅ | ✅ | Enable events + get all nodes |
| `get_nodes` | ✅ | ✅ | Get all commissioned nodes |
| `get_node` | ✅ | ❌ | Get single node by ID |
| `interview_node` | ✅ | ⚠️ | Stubbed - no actual re-interview |
| `remove_node` | ✅ | ✅ | Decommission and remove node |
| `ping_node` | ✅ | ⚠️ | Stubbed - returns cached IPs with true |
| `get_node_ip_addresses` | ✅ | ✅ | Get node's current IP addresses |
| `set_default_fabric_label` | ✅ | ✅ | Set fabric label for new nodes |

### Device Control Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `device_command` | ✅ | ✅ | Invoke cluster commands |
| `read_attribute` | ✅ | ✅ | Read device attributes |
| `write_attribute` | ✅ | ✅ | Write device attributes |

### Access Control & Binding Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `set_acl_entry` | ✅ | ✅ | Set access control list entries |
| `set_node_binding` | ✅ | ✅ | Set node bindings for device communication |

### Server Information Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `server_info` | ✅ | ⚠️ | Sent on connect, no separate command |
| `diagnostics` | ✅ | ✅ | Full server diagnostics dump |
| `get_vendor_names` | ✅ | ✅ | Vendor ID to name mapping |

### Fabric Management Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `get_matter_fabrics` | ❌ | ✅ | Get fabrics connected to device |
| `remove_matter_fabric` | ❌ | ✅ | Remove specific fabric from device |

### OTA Update Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `check_node_update` | ✅ | ⚠️ | Returns null - not implemented |
| `update_node` | ✅ | ⚠️ | Returns null - not implemented |

### Testing/Debug Commands

| Command | Python | Matter.js | Notes |
|---------|--------|-----------|-------|
| `import_test_node` | ✅ | ❌ | Import test nodes from diagnostics |

---

## Event Comparison

| Event | Python | Matter.js | Notes |
|-------|--------|-----------|-------|
| `node_added` | ✅ | ✅ | New node commissioned |
| `node_updated` | ✅ | ✅ | Node data/state changed |
| `node_removed` | ✅ | ✅ | Node decommissioned |
| `node_event` | ✅ | ✅ | Cluster events (e.g., button press) |
| `attribute_updated` | ✅ | ✅ | Attribute value changed |
| `server_shutdown` | ✅ | ❌ | Server shutting down notification |
| `server_info_updated` | ✅ | ❌ | Server info changed |
| `endpoint_added` | ✅ | ❌ | Bridge endpoint added |
| `endpoint_removed` | ✅ | ❌ | Bridge endpoint removed |

---

## Missing Functionality - Detailed

### 1. `commission_on_network` (Priority: Medium)

> **Note:** `set_acl_entry` and `set_node_binding` have been implemented and are no longer missing.

**Purpose:** Commission a device that's already on the network using only the setup PIN code, without needing a QR code or manual pairing code.

**Python Implementation:**
```python
async def commission_on_network(
    self,
    setup_pin_code: int,
    filter_type: int = 0,        # Discovery filter type
    filter: Any = None,          # Discovery filter value
    ip_addr: str | None = None   # Optional: direct IP address
) -> MatterNodeData
```

**Use Cases:**
- Commissioning devices where QR code is damaged/unavailable
- Programmatic commissioning when PIN is known
- Direct commissioning via IP address

**Implementation Notes:**
- Uses `ChipDeviceController.CommissionOnNetwork()` in Python
- Matter.js equivalent: Use `PeerCommissioner` with passcode-based pairing
- Should support discovery filters (vendor ID, device type, etc.)

---

### 2. `get_node` (Priority: Low)

**Purpose:** Get detailed information for a single node by ID.

**Python Implementation:**
```python
async def get_node(self, node_id: int) -> MatterNodeData
```

**Use Cases:**
- Fetch specific node without getting all nodes
- More efficient for single-node queries

**Implementation Notes:**
- Simple wrapper around existing node storage
- Return same `MatterNode` structure as `get_nodes`

---

### 3. `interview_node` - Full Implementation (Priority: Medium)

**Purpose:** Force a complete re-interview of a node to refresh all attributes.

**Current State:** Stubbed - just triggers a node update event without actual re-interview.

**Python Implementation:**
- Disconnects and reconnects to node
- Re-reads all attributes from all endpoints
- Updates stored node data
- Triggers `node_updated` event

**Use Cases:**
- Device firmware updated - need to discover new features
- Suspected stale data
- Debugging connectivity issues

**Implementation Notes:**
- Call `PairedNode.interview()` or equivalent
- Should handle offline nodes gracefully
- May take several seconds for complex devices

---

### 4. `ping_node` - Full Implementation (Priority: Low)

**Purpose:** Actually ping a node's IP addresses to verify network connectivity.

**Current State:** Stubbed - returns cached IPs with `true` status without actual ping.

**Python Implementation:**
```python
async def ping_node(
    self,
    node_id: int,
    attempts: int = 1
) -> dict[str, bool]  # {ip_address: reachable}
```

**Use Cases:**
- Diagnose connectivity issues
- Verify node is reachable before commands
- Network troubleshooting

**Implementation Notes:**
- Use ICMP ping or Matter operational ping
- Support multiple attempts for reliability
- Return per-IP-address results

---

### ~~5. `set_acl_entry`~~ ✅ IMPLEMENTED

This command has been implemented. See `ControllerCommandHandler.setAclEntry()`.

---

### ~~6. `set_node_binding`~~ ✅ IMPLEMENTED

This command has been implemented. See `ControllerCommandHandler.setNodeBinding()`.

---

### ~~5. `node_event` Event~~ ✅ IMPLEMENTED

This event has been implemented. See `WebSocketControllerHandler.onEventChanged()`.

The implementation forwards Matter events to WebSocket clients with the following structure:
```typescript
{
    node_id: number | bigint,
    endpoint_id: number,
    cluster_id: number,
    event_id: number,
    event_number: number | bigint,
    priority: number,        // 0=Debug, 1=Info, 2=Critical
    timestamp: number | bigint,
    timestamp_type: number,  // 0=System, 1=Epoch, 2=POSIX
    data: unknown | null
}
```

---

### 5. `server_shutdown` Event (Priority: Low)

**Purpose:** Notify clients that the server is shutting down gracefully.

**Use Cases:**
- Client can reconnect to backup server
- Client can notify user of disconnection reason
- Clean disconnection handling

**Implementation Notes:**
- Send before closing WebSocket connections
- Include shutdown reason if available

---

### 7. `server_info_updated` Event (Priority: Low)

**Purpose:** Notify clients when server configuration changes.

**Triggers:**
- WiFi credentials set/cleared
- Thread dataset set/cleared
- Bluetooth enabled/disabled

**Use Cases:**
- UI updates to reflect server capabilities
- Commissioning flow adjustments

---

### 8. `endpoint_added` / `endpoint_removed` Events (Priority: Medium)

**Purpose:** Notify clients when bridge devices add/remove child endpoints dynamically.

**Data Format:**
```python
(node_id: int, endpoint_id: int)
```

**Use Cases:**
- Bridge device adds new child device
- Bridge device removes child device
- Dynamic device discovery on bridges

**Implementation Notes:**
- Monitor Descriptor cluster's PartsList attribute
- Compare before/after to detect changes
- Important for Hue Bridge, IKEA Gateway, etc.

---

### 9. OTA Update Support (Priority: Low)

**`check_node_update`:**
- Query Matter CSA Distributed Compliance Ledger (DCL) for updates
- Compare device's current version with available versions
- Return update info if available

**`update_node`:**
- Download firmware from DCL or local source
- Host firmware via built-in OTA Provider
- Trigger OTA Requestor on device
- Monitor update progress

**Implementation Notes:**
- Requires DCL API integration
- OTA Provider already exists in Matter.js server (endpoint 1)
- Complex multi-step process

---

### 10. `import_test_node` (Priority: Low)

**Purpose:** Import mock/test nodes from a diagnostics dump for testing without physical devices.

**Python Implementation:**
```python
async def import_test_node(self, dump: str) -> None
```

**Use Cases:**
- Testing integrations without hardware
- Reproducing issues from user diagnostics
- Development and debugging

**Implementation Notes:**
- Parse JSON dump from `diagnostics` command
- Create mock node entries
- Node IDs >= 900000 reserved for test nodes

---

## Data Structure Differences

### ServerInfoMessage

| Field | Python | Matter.js | Notes |
|-------|--------|-----------|-------|
| `fabric_id` | ✅ | ✅ | |
| `compressed_fabric_id` | ✅ | ✅ | |
| `schema_version` | ✅ | ✅ | Both use version 11 |
| `min_supported_schema_version` | ✅ | ✅ | |
| `sdk_version` | ✅ | ✅ | CHIP SDK version string |
| `wifi_credentials_set` | ✅ | ✅ | |
| `thread_credentials_set` | ✅ | ✅ | |
| `bluetooth_enabled` | ✅ | ✅ | |

### MatterNode

Both implementations use compatible structures with attribute paths in `endpoint/cluster/attribute` format.

---

## Implementation Priority Recommendations

### High Priority (Required for Home Assistant parity)
All high-priority items have been implemented! ✅

### Medium Priority (Important features)
1. `endpoint_added`/`endpoint_removed` events - Bridge support
2. `interview_node` - Full re-interview capability
3. `commission_on_network` - Alternative commissioning

### Low Priority (Nice to have)
4. `get_node` - Single node query
5. `ping_node` - Full implementation
6. `server_shutdown` event
7. `server_info_updated` event
8. OTA update support
9. `import_test_node` - Testing support

---

## Compatibility Notes

1. **Schema Version:** Both use schema version 11, ensuring protocol compatibility
2. **Attribute Format:** Both use `endpoint/cluster/attribute` path format
3. **Data Encoding:** Both use tag-based numeric encoding for structs (e.g., `{"0": value}`)
4. **BigInt Handling:** Both handle node IDs as potentially large integers

The Matter.js server is designed to be a drop-in replacement for the Python Matter Server when used with Home Assistant's Matter integration.
