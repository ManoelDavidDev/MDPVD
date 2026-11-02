export interface JavaReferenceFile {
  path: string;
  language: 'xml' | 'sql' | 'java' | 'css' | 'fxml' | 'bat';
  description: string;
  content: string;
}

export const JAVAFX_REFERENCE_FILES: JavaReferenceFile[] = [
  {
    path: 'pom.xml',
    language: 'xml',
    description:
      'Configuração Maven (Java 21 LTS, JavaFX 21, SQLite JDBC, HikariCP, Flyway, jBCrypt, JUnit 5 e jpackage).',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>br.com.mdpdv</groupId>
    <artifactId>mdpdv-desktop</artifactId>
    <version>1.0.0</version>
    <name>MDPDV Desktop</name>

    <properties>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <maven.compiler.release>21</maven.compiler.release>
        <javafx.version>21.0.5</javafx.version>
        <sqlite.version>3.47.0.0</sqlite.version>
        <flyway.version>10.20.0</flyway.version>
        <junit.version>5.11.3</junit.version>
    </properties>

    <dependencies>
        <!-- Interface Gráfica Nativa JavaFX -->
        <dependency>
            <groupId>org.openjfx</groupId>
            <artifactId>javafx-controls</artifactId>
            <version>\${javafx.version}</version>
        </dependency>
        <dependency>
            <groupId>org.openjfx</groupId>
            <artifactId>javafx-fxml</artifactId>
            <version>\${javafx.version}</version>
        </dependency>

        <!-- Persistência Local SQLite + Pool Single-Writer (JDBC Puro recomendado sobre Hibernate no SQLite) -->
        <dependency>
            <groupId>org.xerial</groupId>
            <artifactId>sqlite-jdbc</artifactId>
            <version>\${sqlite.version}</version>
        </dependency>
        <dependency>
            <groupId>com.zaxxer</groupId>
            <artifactId>HikariCP</artifactId>
            <version>6.0.0</version>
        </dependency>

        <!-- Versionamento do Banco de Dados -->
        <dependency>
            <groupId>org.flywaydb</groupId>
            <artifactId>flyway-core</artifactId>
            <version>\${flyway.version}</version>
        </dependency>

        <!-- Hash Seguro de Senhas -->
        <dependency>
            <groupId>org.mindrot</groupId>
            <artifactId>jbcrypt</artifactId>
            <version>0.4</version>
        </dependency>

        <!-- Integração Fiscal NFC-e / NF-e Brasileira -->
        <dependency>
            <groupId>com.fincatto.documentofiscal</groupId>
            <artifactId>dfe</artifactId>
            <version>4.0.55</version>
        </dependency>

        <!-- Testes Unitários -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>\${junit.version}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>org.mockito</groupId>
            <artifactId>mockito-core</artifactId>
            <version>5.14.2</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.openjfx</groupId>
                <artifactId>javafx-maven-plugin</artifactId>
                <version>0.0.8</version>
                <configuration>
                    <mainClass>br.com.mdpdv.MdpdvApplication</mainClass>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>`,
  },
  {
    path: 'src/main/java/br/com/mdpdv/domain/service/PricingEngine.java',
    language: 'java',
    description:
      'Motor de Precificação e Promoções em Java 21 usando BigDecimal (evita erros de ponto flutuante monetário) e evita descontos duplicados.',
    content: `package br.com.mdpdv.domain.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

public final class PricingEngine {

    public enum PromotionType {
        UNIT_PROMO, PERCENTAGE, QUANTITY_FIXED, BUY_X_PAY_Y
    }

    public record PromotionRule(
        Long id,
        String name,
        PromotionType type,
        int minQuantity,
        BigDecimal promoValue,
        LocalDate startDate,
        LocalDate endDate,
        boolean active
    ) {
        public boolean isValidOn(LocalDate date) {
            if (!active) return false;
            if (startDate != null && date.isBefore(startDate)) return false;
            if (endDate != null && date.isAfter(endDate)) return false;
            return true;
        }
    }

    public record PricingResult(
        BigDecimal grossSubtotal,
        BigDecimal discountAmount,
        BigDecimal netTotal,
        String appliedPromotionName
    ) {}

    /**
     * Calcula automaticamente a melhor condição comercial sem acumular promoções indevidas.
     * Exemplo RF03: 1 cerveja = R$ 5,00 | 12 cervejas = R$ 42,00.
     * Se comprar 14 unidades: (1 pack * 42,00) + (2 avulsas * 5,00) = R$ 52,00.
     */
    public PricingResult evaluateBestCondition(
        int quantity,
        BigDecimal unitPrice,
        BigDecimal catalogPromoPrice,
        List<PromotionRule> rules,
        LocalDate today
    ) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("A quantidade deve ser maior que zero.");
        }

        BigDecimal gross = unitPrice.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal bestNet = gross;
        String bestRuleName = null;

        if (catalogPromoPrice != null && catalogPromoPrice.compareTo(BigDecimal.ZERO) > 0
                && catalogPromoPrice.compareTo(unitPrice) < 0) {
            bestNet = catalogPromoPrice.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
            bestRuleName = "Preço Promocional";
        }

        for (PromotionRule rule : rules) {
            if (!rule.isValidOn(today) || quantity < rule.minQuantity()) {
                continue;
            }

            BigDecimal candidate = switch (rule.type()) {
                case UNIT_PROMO -> rule.promoValue()
                    .multiply(BigDecimal.valueOf(quantity))
                    .setScale(2, RoundingMode.HALF_UP);

                case PERCENTAGE -> {
                    BigDecimal factor = BigDecimal.ONE.subtract(
                        rule.promoValue().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)
                    );
                    yield gross.multiply(factor).setScale(2, RoundingMode.HALF_UP);
                }

                case QUANTITY_FIXED -> {
                    int packs = quantity / rule.minQuantity();
                    int remainder = quantity % rule.minQuantity();
                    BigDecimal packsCost = rule.promoValue().multiply(BigDecimal.valueOf(packs));
                    BigDecimal remCost = unitPrice.multiply(BigDecimal.valueOf(remainder));
                    yield packsCost.add(remCost).setScale(2, RoundingMode.HALF_UP);
                }

                case BUY_X_PAY_Y -> {
                    int groups = quantity / rule.minQuantity();
                    int remainder = quantity % rule.minQuantity();
                    int paidUnits = groups * rule.promoValue().intValue() + remainder;
                    yield unitPrice.multiply(BigDecimal.valueOf(paidUnits)).setScale(2, RoundingMode.HALF_UP);
                }
            };

            if (candidate.compareTo(bestNet) < 0) {
                bestNet = candidate;
                bestRuleName = rule.name();
            }
        }

        BigDecimal discount = gross.subtract(bestNet).max(BigDecimal.ZERO);
        return new PricingResult(gross, discount, bestNet, bestRuleName);
    }
}`,
  },
  {
    path: 'src/main/java/br/com/mdpdv/infrastructure/persistence/SqliteConnectionFactory.java',
    language: 'java',
    description:
      'Configuração SQLite com WAL Mode, Foreign Keys ativas e pool single-connection para evitar SQLITE_BUSY em transações financeiras.',
    content: `package br.com.mdpdv.infrastructure.persistence;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.flywaydb.core.Flyway;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;

public final class SqliteConnectionFactory {

    private final HikariDataSource dataSource;

    public SqliteConnectionFactory(Path appDataDir) throws Exception {
        Files.createDirectories(appDataDir);
        Path dbFile = appDataDir.resolve("mdpdv.sqlite");

        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:sqlite:" + dbFile.toAbsolutePath());
        // SQLite suporta 1 escritor simultâneo: pool enxuto + WAL garante consistência ACID sem lock contention
        config.setMaximumPoolSize(1);
        config.setConnectionInitSql("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");

        this.dataSource = new HikariDataSource(config);

        Flyway.configure()
            .dataSource(this.dataSource)
            .locations("classpath:db/migration")
            .load()
            .migrate();
    }

    public DataSource getDataSource() {
        return dataSource;
    }
}`,
  },
  {
    path: 'src/main/resources/styles/desert-theme.css',
    language: 'css',
    description:
      'Folha de estilo JavaFX oficial do MDPDV aplicando a paleta Deserto (#F5F0E6 Creme, #E8DCC8 Areia, #C87952 Terracota, #A65F3F Barro, #80664C Marrom, #39332D Grafite).',
    content: `.root {
    -fx-base: #F5F0E6;
    -fx-background: #F5F0E6;
    -fx-control-inner-background: #FAF7F2;
    -fx-text-fill: #39332D;
    -fx-font-family: "Segoe UI", "Plus Jakarta Sans", sans-serif;
    -fx-font-size: 13px;
}

.top-nav-bar {
    -fx-background-color: #FAF7F2;
    -fx-border-color: #D9CCB8;
    -fx-border-width: 0 0 1 0;
    -fx-padding: 0 24 0 24;
}

.nav-tab-button {
    -fx-background-color: transparent;
    -fx-text-fill: #5E4A38;
    -fx-padding: 14 12 14 12;
    -fx-border-width: 0 0 2 0;
    -fx-border-color: transparent;
}

.nav-tab-button:selected, .nav-tab-button.active {
    -fx-text-fill: #39332D;
    -fx-font-weight: bold;
    -fx-border-color: #C87952;
}

.btn-primary-clay {
    -fx-background-color: #A65F3F;
    -fx-text-fill: #FAF7F2;
    -fx-font-weight: bold;
    -fx-background-radius: 6;
    -fx-padding: 10 20 10 20;
}

.btn-primary-clay:hover {
    -fx-background-color: #8C4D30;
}

.surface-card {
    -fx-background-color: #FAF7F2;
    -fx-border-color: #D9CCB8;
    -fx-border-radius: 8;
    -fx-background-radius: 8;
}`,
  },
  {
    path: 'src/main/resources/fxml/HomeView.fxml',
    language: 'fxml',
    description:
      'Tela inicial minimalista em FXML exibindo "CAIXA LIVRE" e o botão principal "ABRIR CAIXA" conforme Seção 7.1.',
    content: `<?xml version="1.0" encoding="UTF-8"?>
<?import javafx.scene.control.*?>
<?import javafx.scene.layout.*?>

<StackPane xmlns="http://javafx.com/javafx/21"
           xmlns:fx="http://javafx.com/fxml/1"
           fx:controller="br.com.mdpdv.presentation.controller.HomeController"
           stylesheets="@../styles/desert-theme.css">
    <VBox alignment="CENTER" spacing="16" maxWidth="480" styleClass="surface-card" style="-fx-padding: 48;">
        <Label fx:id="statusTitleLabel"
               text="CAIXA LIVRE"
               style="-fx-font-size: 28px; -fx-font-weight: bold; -fx-text-fill: #39332D;" />
        <Label fx:id="statusSubtitleLabel"
               wrapText="true"
               textAlignment="CENTER"
               text="Nenhuma operação em andamento. O caixa está disponível para uso."
               style="-fx-font-size: 14px; -fx-text-fill: #5E4A38;" />
        <Button fx:id="primaryActionButton"
                text="ABRIR CAIXA"
                onAction="#onOpenCashRegisterClick"
                styleClass="btn-primary-clay" />
    </VBox>
</StackPane>`,
  },
  {
    path: 'scripts/jpackage-windows.bat',
    language: 'bat',
    description:
      'Script de distribuição Windows (.exe / .msi autossuficiente com JRE 21 embutido via jpackage — sem exigir Java ou IntelliJ instalados no cliente).',
    content: `@echo off
REM Empacotamento Nativo Windows do MDPDV com JDK 21 jpackage
call mvn clean package -DskipTests

jpackage ^
  --type msi ^
  --name "MDPDV" ^
  --app-version "1.0.0" ^
  --vendor "MDPDV Sistemas Comerciais" ^
  --input target/dist ^
  --main-jar mdpdv-desktop-1.0.0.jar ^
  --main-class br.com.mdpdv.Launcher ^
  --win-dir-chooser ^
  --win-menu ^
  --win-shortcut ^
  --dest target/installer

echo Instalador Windows gerado com sucesso em target\\installer\\MDPDV-1.0.0.msi`,
  },
];
