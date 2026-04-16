include $(TOPDIR)/rules.mk

PKG_NAME:=rs485-bacnet
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_BUILD_DEPENDS:=rust/host

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/rust/rust-package.mk

define Package/rs485-bacnet
	SECTION:=gateway
	CATEGORY:=Gateway
	TITLE:=RS485 BACnet MS/TP to MQTT Bridge (Rust)
	URL:=https://github.com/seeed
	DEPENDS:=+libc +libstdcpp +libuci +libopenssl +bacnet-stack
endef

define Package/rs485-bacnet/description
	BACnet MS/TP to MQTT uplink bridge for RS485 serial ports.
	Manages bacserv daemon lifecycle and periodically reads BACnet
	device data via bacwhois/bacepics/bacrp CLI tools.
	Publishes collected data to MQTT uplink topic as JSON.
	Reads configuration from UCI (/etc/config/rs485-module).
endef

define Build/Prepare
	$(call Build/Prepare/Default)
	$(CP) ./Cargo.toml $(PKG_BUILD_DIR)/
	mkdir -p $(PKG_BUILD_DIR)/src
	$(CP) ./src/main.rs $(PKG_BUILD_DIR)/src/
endef

define Package/rs485-bacnet/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/rs485-bacnet $(1)/usr/bin/

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/rs485-bacnet.init $(1)/etc/init.d/rs485-bacnet
endef

define Package/rs485-bacnet/postinst
	#!/bin/sh
	[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/rs485-bacnet enable
	/etc/init.d/rs485-bacnet start
	}
	exit 0
endef

define Package/rs485-bacnet/prerm
	#!/bin/sh
	[ -n "$$IPKG_INSTROOT" ] || {
	/etc/init.d/rs485-bacnet stop
	/etc/init.d/rs485-bacnet disable
	}
	exit 0
endef

$(eval $(call RustBinPackage,rs485-bacnet))
$(eval $(call BuildPackage,rs485-bacnet))
