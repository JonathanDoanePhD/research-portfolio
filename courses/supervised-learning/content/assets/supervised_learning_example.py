"""Teaching examples adapted from source slides 25, 37, 48 and 52.

New safeguards: train/test split, train-only imputation/scaling, explicit
features, complete imports and held-out metrics. Ten source rows are for
demonstration only, not evidence supporting real student decisions.
Run: python supervised_learning_examples.py
Dependencies: pandas, scikit-learn
"""
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import accuracy_score, mean_absolute_error
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

# Relevant source columns, transcribed from slide 24. No new observations.
data = pd.DataFrame({
    "student_id": [f"S{i:03d}" for i in range(1, 11)],
    "attendance_rate_pct": [91, 62, 95, 25, 98, 48, 89, 71, 40, 93],
    "study_hours_per_week": [12, 4, 18, 1, 22, 6, 15, None, 3, 11],
    "final_project_score": [93, 58, 96, 35, 99, 49, 88, 76, 42, 94],
    "completed_program": ["Yes", "No", "Yes", "No", "Yes", "No", "Yes", "Yes", "No", "Yes"],
})
features = ["attendance_rate_pct", "study_hours_per_week"]
X = data[features]

def regression_demo(estimator, name):
    y = data["final_project_score"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42
    )
    model = make_pipeline(SimpleImputer(strategy="mean"), estimator)
    model.fit(X_train, y_train)
    print(name, "held-out MAE:", round(mean_absolute_error(y_test, model.predict(X_test)), 2))
    return model

def classification_demo(estimator, name, scale=False):
    y = data["completed_program"].eq("Yes").astype(int)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )
    steps = [SimpleImputer(strategy="mean")]
    if scale:
        steps.append(StandardScaler())
    model = make_pipeline(*steps, estimator)
    model.fit(X_train, y_train)
    print(name, "held-out accuracy:", round(accuracy_score(y_test, model.predict(X_test)), 2))
    return model

if __name__ == "__main__":
    print("DEMONSTRATION ONLY: 10 source rows, 3 held-out rows per example.")
    linear = regression_demo(LinearRegression(), "Multiple linear regression")
    print("Linear coefficients:", dict(zip(features, linear[-1].coef_)))
    logistic = classification_demo(LogisticRegression(max_iter=1000), "Logistic regression", scale=True)
    print("Example P(completion):", round(logistic.predict_proba(X.iloc[[0]])[0, 1], 3))
    tree = classification_demo(DecisionTreeClassifier(max_depth=3, random_state=42), "Decision tree")
    forest = regression_demo(RandomForestRegressor(n_estimators=100, max_depth=5, random_state=42), "Random forest")
    print("Metrics are unstable on this tiny dataset. They illustrate API usage.")
    print("Coefficients/importances do not prove causation or fairness.")
    print("For source energy task is_high_price = price_actual > 68:")
    print("Exclude price_actual from X because it directly defines the target.")
    print("For forecasting, use a time-aware evaluation split and only inputs available at prediction time.")
